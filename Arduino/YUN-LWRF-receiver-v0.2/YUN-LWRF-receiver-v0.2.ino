/* 
  433 MHz RF REMOTE REPLAY sketch 
     Written by ScottC 24 Jul 2014
     Arduino IDE version 1.0.5
     Website: http://arduinobasics.blogspot.com
     Receiver: XY-MK-5V      Transmitter: FS1000A/XY-FST
     Description: Use Arduino to receive and transmit RF Remote signal          
 ------------------------------------------------------------- */
#include <Process.h>
 
#define rfReceivePin 7     //RF Receiver data pin = Digital pin 7

String dataString = "";                  //string to pass over the bridge
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
unsigned long timeMillis;
//String hex2bin[16] = {"0000","0001","0010","0011","0100","0101","0110","0111","1000","1001","1010","1011","1100","1101","1110","1111"};
//String toHEX[16] = {"0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"};
 
void setup(){
  Bridge.begin();
  Serial.begin(9600);
  //while (!SerialUSB); // wait for Serial port to connect.

  dataString = "Filesystem datalogger\n";
  SerialUSB.println(dataString);

  Process p;                          // Create a process and call it "p"
  p.begin("sh");                      // shell command
  p.addParameter("/root/log.sh");     // found in the log.sh
  p.addParameter(dataString);
  p.run();                            // Run the process and wait for its termination
  
  
  pinMode(rfReceivePin, INPUT);
}
 
void loop(){
  //Serial.println('listening to incoming RF signal...');
  listenForLightWaveRFsignal();

  timeMillis = millis();
  char millisSTR[16];
  sprintf(millisSTR," %lu",timeMillis);
  Serial.print(timeMillis);
  Serial.print(": ");

  Process p;                          // Create a process and call it "p"
  p.begin("sh");                      // shell command
  p.addParameter("/root/send2HomeServer.sh"); // found in the command.sh
  p.addParameter(dataString + millisSTR );
  p.run();                            // Run the process and wait for its termination


//  Process p;                          // Create a process and call it "p"
  p.begin("sh");                      // shell command
  p.addParameter("/root/log.sh");     // found in the log.sh
  p.addParameter(dataString);
  p.run();                            // Run the process and wait for its termination
  
    SerialUSB.println(dataString);
    dataString = "";
    delay(2000);
//  }
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
 
 
void listenForLightWaveRFsignal() {

   //Identify the length of the HIGH signal---------------HIGH
   PulseTimeLength = pulseIn(rfReceivePin, HIGH);
   while(PulseTimeLength < 200 || PulseTimeLength > 300) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); }  //wait for a valid pulse
   S = micros();

 while(E < 68) {
   
   dataBIT = 0;
   
   //wait for a valid sequence HIGH-LOW
   while(dataBIT < 400 || dataBIT > 600) {

      dataBIT = PulseTimeLength; // store HIGH TimeLength
      PulseTimeLength = pulseIn(rfReceivePin, HIGH); //Identify the length of the next HIGH signal---------------HIGH
      while(PulseTimeLength < 200) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); } // filter out noise
      E = micros();
      dataBIT += E - S - PulseTimeLength; //Identify and store the length of the LOW signal---------------LOW
      S = E;
   }

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
      if(dataBIT < 500 || dataBIT > 2000) { E = i; break; } //invalid Pulse Length
   }
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
   //Serial.println(dataString);
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
    //Serial.print(" - "); Serial.println(byte2nibble(R));
    dataString.setCharAt(--charPos, byte2nibble(R));
    if(charPos == 0) charPos = 10;
   }
   //Serial.print(E); Serial.print(": "); Serial.print(dataBIT); Serial.print(": ");
   dataString.setCharAt(10, '-');
   dataString.remove(11);
   dataString.replace("1000-", "0100");
   dataString.replace("1001-", "0101");
   dataString.replace("10F0-", "1002");
   dataString.replace("12F2-", "1003");
   dataString.replace("13F2-", "1004");
   dataString.replace("14F2-", "1005");
   //Serial.println(dataString);
   //dataString = "";
//}   
   E = 0;
}
