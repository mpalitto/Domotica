/*
  ESP8266 RF 433MHz Receiver
  v2.1 — RF Event Fusion update (see DOCs/RF-EVENT-FUSION.md):
    - SNTP-synced UTC epoch-ms of the first RF pulse (message field 3)
    - Identity derived from chip id: field 4 = "rx-XXXXXX" (friendly names live
      server-side in receivers.config, never baked into firmware)
    - ArduinoOTA (password in secrets.h) — future updates over WiFi
    - IDENTIFY: server sends "ID" down the existing TCP connection → LED blinks
    - WiFi creds + OTA password + NTP servers in gitignored secrets.h
  Replaces Arduino YUN receiver for LightwaveRF signals
*/

#include <ESP8266WiFi.h>
#include <ArduinoOTA.h>
#include "secrets.h"

// ============================================================================
// CONFIGURATION
// ============================================================================
const char* SERVER_HOST = "192.168.1.77";
const uint16_t SERVER_PORT = 1234;
// Kept verbatim: preprocess_rfxcom.sh validates/extracts by fixed positions,
// field 1 must stay the 7-char "0A1400a" header.
const char* PROTOCOL_HEADER = "0A1400a";

// ============================================================================
// PIN DEFINITIONS
// ============================================================================
#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif
#define RF_RECEIVE_PIN 4  // D2 on NodeMCU

// ============================================================================
// RF SIGNAL CONSTANTS (unchanged from v1)
// ============================================================================
#define PULSE_MIN_US 200
#define PULSE_MAX_US 300
#define VALID_PULSE_MIN_US 400
#define VALID_PULSE_MAX_US 600
#define INVALID_PULSE_MIN_US 300
#define INVALID_PULSE_MAX_US 2500
#define PULSE_TIMEOUT_US 100000  // 100ms timeout for pulseIn
#define DELAY_DIVISOR 500
#define EXPECTED_PULSES 68
#define DATA_BUFFER_SIZE 200
#define MAX_DATA_STRING_LENGTH 100
#define INTER_CODE_TIMEOUT_MS 1000

// ============================================================================
// NETWORK CONSTANTS
// ============================================================================
#define WIFI_RETRY_DELAY_MS 500
#define CONNECTION_TIMEOUT_MS 5000
#define TIME_SYNC_TIMEOUT_MS 15000
#define TIME_VALID_EPOCH_SEC 1600000000  // 2020-09-13, anything below = not synced

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
WiFiClient espClient;

// Identity (chip-derived, immutable — same firmware image fits every receiver)
char receiverId[16] = "";

// Time sync (SNTP, UTC)
bool timeSynced = false;
unsigned long long firstPulseEpochMs = 0;
unsigned long long lastSentEpochMs = 0;

// RF Signal Processing
char currentDataString[MAX_DATA_STRING_LENGTH] = "";
char previousDataString[MAX_DATA_STRING_LENGTH] = "";
unsigned int pulseDataBuffer[DATA_BUFFER_SIZE];
unsigned long pulseTimeLength = 0;
unsigned int dataBit = 0;
unsigned int pulseDelay = DELAY_DIVISOR;
unsigned int startMicros = 0;
unsigned int endMicros = 0;
unsigned int pulseCount = 0;
bool isBadCode = false;
unsigned int codeConfidence = 0;

// Timing
unsigned long codeMillis = 0;
unsigned long previousCodeMillis = 0;
unsigned long interCodeMillis = 0;

// ============================================================================
// TIME SYNC (SNTP)
// ============================================================================
unsigned long long nowEpochMs() {
  return (unsigned long long)time(nullptr) * 1000ULL + (millis() % 1000);
}

void refreshSyncState() {
  if (!timeSynced && time(nullptr) > TIME_VALID_EPOCH_SEC) {
    timeSynced = true;
    Serial.print("SNTP synced, epoch = ");
    Serial.println((unsigned long long)time(nullptr));
  }
}

// Monotonic guard: server fusion must never see time run backwards
unsigned long long monotonicEpochMs(unsigned long long t) {
  if (t <= lastSentEpochMs) t = lastSentEpochMs + 1;
  lastSentEpochMs = t;
  return t;
}

// ============================================================================
// LIGHTWAVE RF NIBBLE MAPPING (unchanged from v1)
// ============================================================================
char byte2nibble(uint8_t byteValue) {
  switch (byteValue) {
    case 0xF6: return '0';
    case 0xEE: return '1';
    case 0xED: return '2';
    case 0xEB: return '3';
    case 0xDE: return '4';
    case 0xDD: return '5';
    case 0xDB: return '6';
    case 0xBE: return '7';
    case 0xBD: return '8';
    case 0xBB: return '9';
    case 0xB7: return 'A';
    case 0x7E: return 'B';
    case 0x7D: return 'C';
    case 0x7B: return 'D';
    case 0x77: return 'E';
    case 0x6F: return 'F';
    default:   return '?';
  }
}

// ============================================================================
// WIFI SETUP
// ============================================================================
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);  // don't keep stale SDK wifi config in flash
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  bool ledState = false;
  unsigned long startAttempt = millis();

  while (WiFi.status() != WL_CONNECTED) {
    yield();  // Prevent watchdog reset

    if (millis() - startAttempt > 30000) {
      Serial.println("\nWiFi connection timeout! Restarting...");
      ESP.restart();
    }

    delay(WIFI_RETRY_DELAY_MS);
    Serial.print(".");

    digitalWrite(LED_BUILTIN, ledState ? LOW : HIGH);
    ledState = !ledState;
  }

  digitalWrite(LED_BUILTIN, HIGH);  // LED off (LOW = ON for ESP8266)

  Serial.println("\nWiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Signal strength (RSSI): ");
  Serial.println(WiFi.RSSI());
}

// ============================================================================
// OTA SETUP — future updates over WiFi, no more unplugging
// ============================================================================
void setupOTA() {
  ArduinoOTA.setHostname(receiverId);
  ArduinoOTA.setPassword(OTA_PASSWORD);

  ArduinoOTA.onStart([]() {
    Serial.println("OTA start");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\nOTA end — rebooting");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    static unsigned int lastPct = 200;
    unsigned int pct = progress * 100 / total;
    if (pct != lastPct && pct % 10 == 0) { Serial.printf("OTA %u%%\n", pct); lastPct = pct; }
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("OTA error[%u]\n", error);
  });

  ArduinoOTA.begin();
  Serial.print("OTA ready as hostname: ");
  Serial.println(receiverId);
}

// ============================================================================
// SOCKET CONNECTION MANAGEMENT
// ============================================================================
bool ensureWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    setup_wifi();
    return WiFi.status() == WL_CONNECTED;
  }
  return true;
}

bool ensureSocketConnection() {
  if (!ensureWiFiConnection()) {
    return false;
  }

  if (espClient.connected()) {
    return true;
  }

  Serial.print("Connecting to server ");
  Serial.print(SERVER_HOST);
  Serial.print(":");
  Serial.println(SERVER_PORT);

  if (espClient.connect(SERVER_HOST, SERVER_PORT)) {
    Serial.println("Socket connected successfully!");
    espClient.println(String(receiverId) + " connected");
    return true;
  } else {
    Serial.println("Socket connection failed!");
    return false;
  }
}

void setupSocket() {
  Serial.println("Initializing socket connection...");

  if (!ensureSocketConnection()) {
    Serial.println("WARNING: Socket connection failed. Will retry on first transmission.");
  }
}

// ============================================================================
// INCOMING COMMANDS (server → receiver over the existing TCP connection)
// ============================================================================
void handleIncoming() {
  if (!espClient.available()) return;

  String cmd = espClient.readStringUntil('\n');
  cmd.trim();

  if (cmd.startsWith("ID")) {
    Serial.println("IDENTIFY requested — blinking LED");
    for (int i = 0; i < 10; i++) {
      digitalWrite(LED_BUILTIN, LOW);   delay(80);   // LOW = ON
      digitalWrite(LED_BUILTIN, HIGH);  delay(120);
    }
    espClient.println(String(receiverId) + " IDENTIFY OK");
  }
}

// ============================================================================
// DATA TRANSMISSION
// ============================================================================
bool sendDataToServer(const char* data) {
  if (!ensureSocketConnection()) {
    Serial.println("Cannot send data - no connection");
    return false;
  }

  if (espClient.println(data)) {
    Serial.print("Successfully sent: ");
    Serial.println(data);
    return true;
  } else {
    Serial.println("Failed to send data");
    espClient.stop();
    return false;
  }
}

// ============================================================================
// RF SIGNAL PROCESSING (unchanged from v1)
// ============================================================================
void initPulseBuffer() {
  for (int i = 0; i < DATA_BUFFER_SIZE; i++) {
    pulseDataBuffer[i] = 0;
  }
}

bool waitForValidPulse() {
  pulseTimeLength = pulseIn(RF_RECEIVE_PIN, HIGH, PULSE_TIMEOUT_US);

  unsigned long startWait = millis();
  while (pulseTimeLength < PULSE_MIN_US || pulseTimeLength > PULSE_MAX_US) {
    yield();

    if (millis() - startWait > 5000) {
      return false;
    }

    pulseTimeLength = pulseIn(RF_RECEIVE_PIN, HIGH, PULSE_TIMEOUT_US);

    if (pulseTimeLength == 0) {
      return false;
    }
  }

  startMicros = micros();
  // Stamp the RF event time at the first valid pulse of the burst
  firstPulseEpochMs = timeSynced ? nowEpochMs() : 0;

  previousCodeMillis = codeMillis;
  codeMillis = millis();
  interCodeMillis = codeMillis - previousCodeMillis;

  return true;
}

bool readPulseSequence() {
  pulseCount = 0;

  while (pulseCount < EXPECTED_PULSES) {
    yield();

    dataBit = 0;

    // Wait for valid HIGH-LOW sequence
    while (dataBit < VALID_PULSE_MIN_US || dataBit > VALID_PULSE_MAX_US) {
      yield();

      dataBit = pulseTimeLength;  // Store HIGH time length
      pulseTimeLength = pulseIn(RF_RECEIVE_PIN, HIGH, PULSE_TIMEOUT_US);

      // Filter out noise
      while (pulseTimeLength < PULSE_MIN_US && pulseTimeLength != 0) {
        yield();
        pulseTimeLength = pulseIn(RF_RECEIVE_PIN, HIGH, PULSE_TIMEOUT_US);
      }

      if (pulseTimeLength == 0) {
        return false;
      }

      endMicros = micros();
      dataBit += endMicros - startMicros - pulseTimeLength;  // Add LOW time
      startMicros = endMicros;
    }

    pulseDataBuffer[0] = dataBit;

    // Read the rest of the signal
    for (int i = 1; i < DATA_BUFFER_SIZE; i++) {
      yield();

      dataBit = pulseTimeLength;  // Store HIGH pulse
      pulseTimeLength = pulseIn(RF_RECEIVE_PIN, HIGH, PULSE_TIMEOUT_US);

      if (pulseTimeLength == 0) {
        pulseCount = i;
        return false;
      }

      endMicros = micros();
      unsigned int lowTime = endMicros - startMicros - pulseTimeLength;
      dataBit += lowTime;
      startMicros = endMicros;

      pulseDataBuffer[i] = dataBit;

      if (dataBit < INVALID_PULSE_MIN_US || dataBit > INVALID_PULSE_MAX_US) {
        pulseCount = i;
        break;
      }
    }
  }

  return true;
}

void decodePulseData() {
  // Build binary string from pulses
  char binaryString[MAX_DATA_STRING_LENGTH] = "";
  int binaryPos = 0;

  for (int i = pulseCount - 1; i > 0 && binaryPos < MAX_DATA_STRING_LENGTH - 2; i--) {
    unsigned int pulseRatio = pulseDataBuffer[i] / pulseDelay;
    binaryString[binaryPos++] = '1';
    if (pulseRatio == 3 && binaryPos < MAX_DATA_STRING_LENGTH - 1) {
      binaryString[binaryPos++] = '0';
    }
  }
  binaryString[binaryPos] = '\0';

  // Reconstruct the 10-char LightwaveRF code exactly as the original YUN
  // receiver does (notMantained/YUN-LWRF-receiver-v0.2). Layout:
  //   positions 5..0 <- nibbles 1..6 (address, reverse order)
  //   position 6     <- the raw binary bit at index 6 (always '1' in practice)
  //   positions 9..7 <- nibbles 7..9 (command)
  //   position 10    <- '-' so the command replacements below can rewrite it
  // The server's preprocessor slices the line by fixed positions, so the code
  // MUST keep this 6-address + 4-command layout. A previous ESP8266 "refactor"
  // truncated this to 6 nibbles + "-" (e.g. "F4AA0D-"), which the server
  // rejects as INVALID and silently drops.
  char codeBuf[16];
  memset(codeBuf, ' ', sizeof(codeBuf));
  codeBuf[10] = '-';
  codeBuf[11] = '\0';
  if (binaryPos > 6) codeBuf[6] = binaryString[6];

  isBadCode = false;

  int charPos = 6;  // write into 5,4,3,2,1,0 then 9,8,7

  for (int j = 1; j < 81 && j + 7 < binaryPos; j += 9) {
    uint8_t byteCode = 0x80;
    uint8_t byteValue = 0;

    for (int i = j + 7; i >= j; i--) {
      if (binaryString[i] == '1') {
        byteValue += byteCode;
      }
      byteCode = byteCode >> 1;
    }

    char nibble = byte2nibble(byteValue);

    if (nibble == '?') {
      isBadCode = true;
      Serial.print(" - ERROR: Unknown byte value 0x");
      Serial.println(byteValue, HEX);
      break;
    }

    Serial.print(" - ");
    Serial.println(nibble);

    codeBuf[--charPos] = nibble;
    if (charPos == 0) charPos = 10;
  }

  if (isBadCode) {
    Serial.println("[BAD CODE - Decoding failed]");
    return;
  }

  // Command-suffix transformations (verbatim from the original receiver)
  String tempString = String(codeBuf);
  tempString.replace("1000-", "0100");
  tempString.replace("1001-", "0101");
  tempString.replace("10F0-", "1002");
  tempString.replace("12F2-", "1003");
  tempString.replace("13F2-", "1004");
  tempString.replace("14F2-", "1005");
  // Unmatched codes still carry the trailing '-'; the wire format never has it
  tempString.replace("-", "");

  strncpy(currentDataString, tempString.c_str(), MAX_DATA_STRING_LENGTH - 1);
  currentDataString[MAX_DATA_STRING_LENGTH - 1] = '\0';

  Serial.print("Decoded: ");
  Serial.println(currentDataString);
}

void listenForLightWaveRFSignal() {
  if (!waitForValidPulse()) {
    return;  // No valid pulse found
  }

  if (!readPulseSequence()) {
    Serial.println("Incomplete pulse sequence");
    return;
  }

  pulseDelay = DELAY_DIVISOR;
  decodePulseData();
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(RF_RECEIVE_PIN, INPUT);
  digitalWrite(LED_BUILTIN, HIGH);  // LED off

  Serial.begin(115200);
  delay(100);

  // Identity: immutable, chip-derived — safe to flash any image on any unit
  snprintf(receiverId, sizeof(receiverId), "rx-%06x", ESP.getChipId());

  Serial.println("\n\n=== ESP8266 RF 433MHz Receiver ===");
  Serial.print("Version: 2.1 (RF Event Fusion)   id: ");
  Serial.println(receiverId);

  initPulseBuffer();
  currentDataString[0] = '\0';
  previousDataString[0] = '\0';
  interCodeMillis = 0;
  codeConfidence = 0;

  setup_wifi();

  // SNTP: UTC only, no TZ/DST on the device — convert server-side
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);
  Serial.print("Waiting for SNTP sync (up to ");
  Serial.print(TIME_SYNC_TIMEOUT_MS / 1000);
  Serial.println("s)...");
  unsigned long syncStart = millis();
  while (time(nullptr) <= TIME_VALID_EPOCH_SEC && millis() - syncStart < TIME_SYNC_TIMEOUT_MS) {
    yield();
    delay(200);
    Serial.print(".");
  }
  Serial.println();
  refreshSyncState();
  if (!timeSynced) {
    Serial.println("WARNING: no SNTP sync — will send epoch 0 until synced");
  }

  setupOTA();
  setupSocket();

  Serial.println("Setup complete. Listening for RF signals...\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  yield();

  ArduinoOTA.handle();   //OTA updates over WiFi
  handleIncoming();      //IDENTIFY etc. from server
  refreshSyncState();    //pick up SNTP sync as soon as it lands

  // Save previous data
  strncpy(previousDataString, currentDataString, MAX_DATA_STRING_LENGTH);
  currentDataString[0] = '\0';

  // Listen for RF signal
  listenForLightWaveRFSignal();

  // Update confidence counter
  if (interCodeMillis > INTER_CODE_TIMEOUT_MS) {
    codeConfidence = 0;
  } else {
    if (!isBadCode && strlen(currentDataString) > 0) {
      codeConfidence++;
    }
  }

  // Debug output
  if (strlen(currentDataString) > 0 || interCodeMillis > INTER_CODE_TIMEOUT_MS) {
    Serial.println();
    Serial.print(isBadCode ? "BAD CODE" : "GOOD CODE");
    Serial.print(" : ");
    Serial.print(interCodeMillis);
    Serial.print(" ms : Confidence=");
    Serial.println(codeConfidence);
  }

  // Send data on first valid reception (confidence == 1)
  if (!isBadCode && codeConfidence == 1 && strlen(currentDataString) > 0) {
    // Message v2: HEADER CODE EPOCH_MS ID  (field order kept for the preprocessor;
    // field 3 = UTC epoch-ms of the first RF pulse, 0 = SNTP not synced yet;
    // field 4 = chip-derived identity instead of a friendly name)
    unsigned long long rfEpoch = monotonicEpochMs(firstPulseEpochMs);

    char message[100];
    snprintf(message, sizeof(message), "%s %s %llu %s",
             PROTOCOL_HEADER,
             currentDataString,
             rfEpoch,
             receiverId);

    Serial.print("RF time: ");
    Serial.println(rfEpoch);

    if (!sendDataToServer(message)) {
      delay(100);
      sendDataToServer(message);
    }
  }

  // Reset bad code flag for next iteration
  if (isBadCode) {
    isBadCode = false;
  }
}
