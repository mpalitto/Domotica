 /*
Intended for replacing Arduino YUN receiver
*/

#include <ESP8266WiFi.h>
//#include <RCSwitch.h>
//RCSwitch mySwitch = RCSwitch();

#define LED_BUILTIN 2 
#define rfReceivePin 4     // RF Receiver Data => that is pin #D2 = 4
// Update these with values suitable for your network.
const char* ssid = "NathanielPI";
const char* password = "PresaDellaBastiglia";
const char* host = "192.168.1.77";  // IP serveur - Server IP
const int   port = 1234;            // Port serveur - Server Port
String receiverN = "0A1400a ";
String receiverName = " nodeMCU-1";

String dataString = "";                  //string to pass over the bridge
String prevData = "";                   //previous data
const int dataSize = 200;                //Arduino memory is limited (max=1700)
unsigned int storedData[dataSize];       //Create an array to store the data
unsigned long PulseTimeLength = 0;
unsigned int dataBIT = 0;
unsigned int Delay = 128;
unsigned int nPulse = 40;
unsigned int R = 0; //remainder
unsigned int S = 0; //start microsecond counter
unsigned int E = 0; //end microseconds counter
unsigned int bitCode = 0;
unsigned int syncP = 0;
unsigned int syncL = 0;
char nibble = '?';
boolean badCODE = false;
unsigned int codeCONFIDANCE = 0;

WiFiClient espClient;
long lastMsg = 0;
// String msg;
char msg[75];
// int value = 0;
int current = 0;
int led = 0;
int maxx = 0;

void setup_wifi() {
  delay(10);
  // We start by connecting to a WiFi network
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);
  int led=0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (led == 0) {
      digitalWrite(LED_BUILTIN, HIGH);   // Turn the LED on (Note that LOW is the voltage level
      led = 1;
    } else {
      digitalWrite(LED_BUILTIN, LOW);   // Turn the LED on (Note that LOW is the voltage level
      led = 0;
    }
  digitalWrite(LED_BUILTIN, HIGH);   // Turn the LED on (Note that LOW is the voltage level
  }

  randomSeed(micros());

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

//WiFiClient client;

void setSocket() {

    Serial.println("Setting UP SOCKET connection");   

    if (WiFi.status()!= WL_CONNECTED){   //Check WiFi connection status
      setup_wifi();
      delay(1000);
      Serial.println("WiFi connection SUCCESSFUL");   
    }
    
    if (espClient.connect(host, port)) {
      Serial.println("connection YESSS");
      espClient.println(String("YESSS\n"));
    } else {
      Serial.println("connection failed");
      return;    
    } 
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);     // Initialize the LED_BUILTIN pin as an output
  //mySwitch.enableReceive(rfReceivePin);  
  pinMode(rfReceivePin, INPUT);

  Serial.begin(115200);
  setSocket();
  
}

unsigned long interCodeMillis = 0;
unsigned long timeMillis;

void loop() {

  //Serial.println("loop");
    //Serial.print("loop : ");
    //Serial.print(interCodeMillis);

  prevData = dataString;
  dataString = "";
  listenForLightWaveRFsignal();
  if (interCodeMillis > 1000) {
   codeCONFIDANCE = 0; 
  } else {
    if(badCODE == false) { codeCONFIDANCE++; }
  }
//  if (prevData != dataString || interCodeMillis > 1000) {
    Serial.println("");
    if(badCODE == false) { Serial.print("GOOD CODE"); } else { Serial.print("BAD CODE"); }
    Serial.print(" : ");
    Serial.print(interCodeMillis);
    Serial.print(" : ");
    Serial.println(codeCONFIDANCE);

//  if(codeCONFIDANCE == 1) {
  if((badCODE == false) && (codeCONFIDANCE == 1)) {

    timeMillis = millis();
    char millisSTR[16];
    sprintf(millisSTR," %lu",timeMillis);
    Serial.print(timeMillis);
    Serial.print(": ");
      prevData =  receiverN + dataString + millisSTR + receiverName;
      if (espClient.println(prevData)) {
        Serial.print("SUCCESSFULLY SENT: ");
      } else {
        Serial.println("NO SOCKET???!!!");
        setSocket(); // setup socket connection if not done yet
        if (espClient.println(prevData)) {
           Serial.print("SUCCESSFULLY SENT: ");
           //delay(10000);
        } else {
          Serial.print("ERROR SENDING: ");
        }
      }
      //delay(100);
      Serial.println(dataString);        
      Serial.println(prevData);        
  }
  //Serial.print(interCodeMillis);
  //Serial.println(" : ");
  if(badCODE == true) { badCODE = false; }

}

//lightwaveRF mapping
char byte2nibble(int b) {
  //static byte byte2nibbleMap[16] = {0xF6,0xEE,0xED,0xEB,0xDE,0xDD,0xDB,0xBE,0xBD,0xBB,0xB7,0x7E,0x7D,0x7B,0x77,0x6F};
  char buf[6];
  switch (b)
  {    
    case 0xF6:
      return '0';
      break;
    case 0xEE:
      return '1';
      break;
    case 0xED:
      return '2';
      break;
    case 0xEB:
      return '3';
      break;
    case 0xDE:
      return '4';
      break;
    case 0xDD:
      return '5';
      break;
    case 0xDB:
      return '6';
      break;
    case 0xBE:
      return '7';
      break;
    case 0xBD:
      return '8';
      break;
    case 0xBB:
      return '9';
      break;
    case 0xB7:
      return 'A';
      break;
    case 0x7E:
      return 'B';
      break;
    case 0x7D:
      return 'C';
      break;
    case 0x7B:
      return 'D';
      break;
    case 0x77:
      return 'E';
      break;
    case 0x6F:
      return 'F';
      break;
    default:
      //sprintf(buf, "(%02X)\0", b);
      //return buf;
      return '?';
    break;
  }
}
 
/* ------------------------------------------------------------------------------
     Initialise the array used to store the signal 
    ------------------------------------------------------------------------------*/
void initVariables(){
   for(int i=0; i<dataSize; i++) storedData[i]=0;
}
 
unsigned long codeMillis = 0;
unsigned long codePrevMillis = 0;
 
void listenForLightWaveRFsignal() {

  //Serial.println("listening for LigthWave RF signal");

   //Identify the length of the HIGH signal---------------HIGH
   PulseTimeLength = pulseIn(rfReceivePin, HIGH);
   while(PulseTimeLength < 200 || PulseTimeLength > 300) {
      //Serial.print("PulseTimeLength : ");
      //Serial.println(PulseTimeLength);

    PulseTimeLength = pulseIn(rfReceivePin, HIGH); 
   }  //wait for a valid pulse
   S = micros();
   codePrevMillis = codeMillis;
   codeMillis = millis();
   interCodeMillis = codeMillis - codePrevMillis;

  while(E < 68) {
   //Serial.println(E);
   
   dataBIT = 0;
   
   //wait for a valid HIGH-LOW sequence
   //Serial.println("waiting for valid H-L sequence");
   while(dataBIT < 400 || dataBIT > 600) {

      dataBIT = PulseTimeLength; // store HIGH TimeLength
      PulseTimeLength = pulseIn(rfReceivePin, HIGH); //Identify the length of the next HIGH signal---------------HIGH
      while(PulseTimeLength < 200) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); } // filter out noise
      E = micros();
      dataBIT += E - S - PulseTimeLength; //Identify and store the length of the LOW signal---------------LOW
      S = E;
   }
   //Serial.println("FOUND valid H-L sequence");

   storedData[0] = dataBIT;
   //nPulse = 1;
   //Delay = dataBIT;

   //Read and store the rest of the signal into the storedData array
   for(int i=1; i<dataSize; i++){
      dataBIT = PulseTimeLength; //store HIGH pulse TimeLength
      //Identify the length of the LOW signal---------------LOW
      PulseTimeLength = pulseIn(rfReceivePin, HIGH);
      //while(PulseTimeLength < 250) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); } // filter out noise
      E = micros();
      PulseTimeLength = (E - S - PulseTimeLength); //Compute LOW signal time length
      dataBIT += (E - S - PulseTimeLength); //Compute LOW signal time length;
      S = E;
      //if(dataBIT < 700) { nPulse++; Delay += dataBIT; }
      storedData[i] = dataBIT;
      if(dataBIT < 300 || dataBIT > 2500) { //invalid Pulse Length
        //Serial.print("Invalid Pulse Length: ");
        //Serial.print(dataBIT);
        //Serial.print(" buffered: ");
        //Serial.print(i);
        //Serial.print("/68");
        E = i; 
        break; 
      } //invalid Pulse Length
   }
   //Serial.println("done storing data sequence into buffer");
  }
//   Delay /= nPulse;
//for(int corr=0; corr>-100; corr=corr-10) {
//   Delay -= 10; //margine di sicurezza
   Delay = 500;
   //Serial.print(nPulse); Serial.print(" : "); Serial.println(Delay);
   //print stored buffer to serial port
   int nBIT = 0;
   int nByte = 0;
   for(int i=--E; i>0; i--) {
       S = storedData[i] / Delay;
       dataString += "1";
       if(S == 3) dataString += "0";
   }
   //Serial.println(dataString); //write 1s and 0s string
   int charPos = 6;
   for(int j=1; j<81; j=j+9) {
      bitCode = 0x80;
      R = 0;
      for(int i=j+7; i>=j; i--) {
         //process the 1 bit
         if(dataString.charAt(i) == '1') R += bitCode; 
         //Serial.print(dataString.charAt(i));
         bitCode = bitCode>>1;
    }
    nibble = byte2nibble(R);
    if(nibble == '?') { badCODE = true; break; }; //no need to keep decoding
    Serial.print(" - "); Serial.println(nibble);
    dataString.setCharAt(--charPos, nibble);
    if(charPos == 0) charPos = 10;
   }
   if(badCODE) { 
    Serial.print("[BAD CODE]"); 
    //badCODE = false; 
    E=0; 
    dataString = prevData;
    return; 
    };
   dataString.setCharAt(10, '-');
   dataString.remove(11);
   
   Serial.print(E); Serial.print(": "); Serial.print(dataBIT); Serial.print(": ");
   Serial.println(dataString);

//   dataString.replace("1000-", "0100");
//   dataString.replace("1001-", "0101");
//   dataString.replace("10F0-", "1002");
//   dataString.replace("12F2-", "1003");
//   dataString.replace("13F2-", "1004");
//   dataString.replace("14F2-", "1005");

   dataString.replace("000-", "100");
   dataString.replace("001-", "101");
   dataString.replace("0F0-", "002");
   dataString.replace("2F2-", "003");
   dataString.replace("3F2-", "004");
   dataString.replace("4F2-", "005");
   //dataString = "";
//}   
   E = 0;
}
