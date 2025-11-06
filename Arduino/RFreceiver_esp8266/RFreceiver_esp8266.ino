/*
  ESP8266 RF 433MHz Receiver
  Replaces Arduino YUN receiver for LightwaveRF signals
*/

#include <ESP8266WiFi.h>

// ============================================================================
// CONFIGURATION - Move these to WiFiManager or SPIFFS in production!
// ============================================================================
const char* WIFI_SSID = "yourWiFi";
const char* WIFI_PASSWORD = "yourPassword";  // TODO: SECURITY RISK - Use WiFiManager!
const char* SERVER_HOST = "192.168.1.77";
const uint16_t SERVER_PORT = 1234;
const char* RECEIVER_ID = "0A1400a";
const char* RECEIVER_NAME = "nodeMCU-1";

// ============================================================================
// PIN DEFINITIONS
// ============================================================================
#define LED_BUILTIN 2
#define RF_RECEIVE_PIN 4  // D2 on NodeMCU

// ============================================================================
// RF SIGNAL CONSTANTS
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
#define SOCKET_RETRY_DELAY_MS 1000
#define CONNECTION_TIMEOUT_MS 5000

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
WiFiClient espClient;

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
// LIGHTWAVE RF NIBBLE MAPPING
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
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  bool ledState = false;
  unsigned long startAttempt = millis();
  
  while (WiFi.status() != WL_CONNECTED) {
    // Prevent watchdog reset
    yield();
    
    // Timeout after 30 seconds
    if (millis() - startAttempt > 30000) {
      Serial.println("\nWiFi connection timeout! Restarting...");
      ESP.restart();
    }
    
    delay(WIFI_RETRY_DELAY_MS);
    Serial.print(".");
    
    // Blink LED while connecting
    digitalWrite(LED_BUILTIN, ledState ? LOW : HIGH);
    ledState = !ledState;
  }
  
  digitalWrite(LED_BUILTIN, HIGH);  // Turn LED off (LOW = ON for ESP8266)
  
  Serial.println("\nWiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Signal strength (RSSI): ");
  Serial.println(WiFi.RSSI());
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
  // Check WiFi first
  if (!ensureWiFiConnection()) {
    return false;
  }
  
  // Check if socket is connected
  if (espClient.connected()) {
    return true;
  }
  
  // Attempt to reconnect
  Serial.print("Connecting to server ");
  Serial.print(SERVER_HOST);
  Serial.print(":");
  Serial.println(SERVER_PORT);
  
  if (espClient.connect(SERVER_HOST, SERVER_PORT)) {
    Serial.println("Socket connected successfully!");
    espClient.println("ESP8266 RF Receiver Connected");
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
// DATA TRANSMISSION
// ============================================================================
bool sendDataToServer(const char* data) {
  // Ensure we have a valid connection
  if (!ensureSocketConnection()) {
    Serial.println("Cannot send data - no connection");
    return false;
  }
  
  // Send data
  if (espClient.println(data)) {
    Serial.print("Successfully sent: ");
    Serial.println(data);
    return true;
  } else {
    Serial.println("Failed to send data");
    espClient.stop();  // Close broken connection
    return false;
  }
}

// ============================================================================
// RF SIGNAL PROCESSING
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
    yield();  // Prevent watchdog reset
    
    // Timeout after 5 seconds of no valid pulse
    if (millis() - startWait > 5000) {
      return false;
    }
    
    pulseTimeLength = pulseIn(RF_RECEIVE_PIN, HIGH, PULSE_TIMEOUT_US);
    
    // No pulse detected
    if (pulseTimeLength == 0) {
      return false;
    }
  }
  
  startMicros = micros();
  previousCodeMillis = codeMillis;
  codeMillis = millis();
  interCodeMillis = codeMillis - previousCodeMillis;
  
  return true;
}

bool readPulseSequence() {
  pulseCount = 0;
  
  while (pulseCount < EXPECTED_PULSES) {
    yield();  // Prevent watchdog reset
    
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
      
      // Timeout - no pulse detected
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
      yield();  // Prevent watchdog reset
      
      dataBit = pulseTimeLength;  // Store HIGH pulse
      pulseTimeLength = pulseIn(RF_RECEIVE_PIN, HIGH, PULSE_TIMEOUT_US);
      
      // Timeout
      if (pulseTimeLength == 0) {
        pulseCount = i;
        return false;
      }
      
      endMicros = micros();
      unsigned int lowTime = endMicros - startMicros - pulseTimeLength;
      dataBit += lowTime;
      startMicros = endMicros;
      
      pulseDataBuffer[i] = dataBit;
      
      // Check for invalid pulse length
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
  
  // Decode binary string to hex nibbles
  char decodedString[12] = "------    ";  // 6 chars + dash + 3 spaces + null
  int charPos = 5;  // Start from position 5 (working backwards)
  
  isBadCode = false;
  
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
    
    decodedString[charPos--] = nibble;
    if (charPos < 0) break;
  }
  
  if (isBadCode) {
    Serial.println("[BAD CODE - Decoding failed]");
    return;
  }
  
  decodedString[6] = '-';
  decodedString[10] = '\0';
  
  // Apply transformations for specific device codes
  String tempString = String(decodedString);
  tempString.replace("000-", "100");
  tempString.replace("001-", "101");
  tempString.replace("0F0-", "002");
  tempString.replace("2F2-", "003");
  tempString.replace("3F2-", "004");
  tempString.replace("4F2-", "005");
  
  strncpy(currentDataString, tempString.c_str(), MAX_DATA_STRING_LENGTH - 1);
  currentDataString[MAX_DATA_STRING_LENGTH - 1] = '\0';
  
  Serial.print("Decoded: ");
  Serial.println(currentDataString);
}

void listenForLightWaveRFSignal() {
  // Wait for valid pulse to start
  if (!waitForValidPulse()) {
    return;  // No valid pulse found
  }
  
  // Read the pulse sequence
  if (!readPulseSequence()) {
    Serial.println("Incomplete pulse sequence");
    return;
  }
  
  // Decode the pulse data
  pulseDelay = DELAY_DIVISOR;
  decodePulseData();
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  // Initialize hardware
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(RF_RECEIVE_PIN, INPUT);
  digitalWrite(LED_BUILTIN, HIGH);  // LED off
  
  // Initialize serial
  Serial.begin(115200);
  delay(100);
  Serial.println("\n\n=== ESP8266 RF 433MHz Receiver ===");
  Serial.println("Version: 2.0");
  
  // Initialize variables
  initPulseBuffer();
  currentDataString[0] = '\0';
  previousDataString[0] = '\0';
  interCodeMillis = 0;
  codeConfidence = 0;
  
  // Connect to WiFi and server
  setup_wifi();
  setupSocket();
  
  Serial.println("Setup complete. Listening for RF signals...\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  yield();  // Prevent watchdog reset
  
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
    unsigned long timestamp = millis();
    
    // Build message: "0A1400a 123456-789 1234567890 nodeMCU-1"
    char message[100];
    snprintf(message, sizeof(message), "%s %s %lu %s",
             RECEIVER_ID, 
             currentDataString, 
             timestamp, 
             RECEIVER_NAME);
    
    Serial.print(timestamp);
    Serial.print(" ms: ");
    
    // Send to server
    if (!sendDataToServer(message)) {
      // Retry once
      delay(100);
      sendDataToServer(message);
    }
  }
  
  // Reset bad code flag for next iteration
  if (isBadCode) {
    isBadCode = false;
  }
}
