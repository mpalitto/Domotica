/* 
 *  
  433 MHz RF REMOTE REPLAY sketch 
     Written by ScottC 24 Jul 2014
     Arduino IDE version 1.0.5
     Website: http://arduinobasics.blogspot.com
     Receiver: XY-MK-5V      Transmitter: FS1000A/XY-FST
     Description: Use Arduino to receive and transmit RF Remote signal          
 ------------------------------------------------------------- */
 #define rfReceivePin 7     //RF Receiver data pin = Digital pin 7
 #define rfTransmitPin 4  //RF Transmitter pin = digital pin 4
 #define button 6           //The button attached to digital pin 6
 #define ledPin 13        //Onboard LED = digital pin 13
 
 const int dataSize = 200;  //Arduino memory is limited (max=1700)
 unsigned int storedData[dataSize];  //Create an array to store the data
 const unsigned int thresholdLOW = 50;  //signal threshold value
 const unsigned int thresholdHIGH = 300;  //signal threshold value
 unsigned int maxSignalLength = 255;   //Set the maximum length of the signal
 unsigned int dataCounter = 0;    //Variable to measure the length of the signal
 unsigned int buttonState = 1;    //Variable to control the flow of code using button presses
 unsigned int buttonVal = 0;      //Variable to hold the state of the button
 unsigned int timeDelay = 105;    //Used to slow down the signal transmission (can be from 75 - 135)
 unsigned int syncBit = 0;
 unsigned int Alfa = 82;
 unsigned long PulseTimeLength = 0;
 unsigned int Delay = 128;
 unsigned int nPulse = 40;
 unsigned int R = 0; //remainder
 unsigned int S = 0; //start microsecond counter
 unsigned int E = 0; //end microseconds counter
 unsigned int bitCode = 0;
 unsigned int syncP = 0;
 unsigned int syncL = 0;
 unsigned int ALFAx4 = 0;
 unsigned int ALFAx12 = 0;
 //String code2send = "1011 0001 1110 0100 0110 0001"; //B1E461
 String code2send = "B1E461";
 String hex2bin[16] = {"0000","0001","0010","0011","0100","0101","0110","0111","1000","1001","1010","1011","1100","1101","1110","1111"};
 String toHEX[16] = {"0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"};
 char command = "";
 char space = "";
 //char code2send[6] = "B1E461";
 String bin = "";
 byte toDec = 0;
 unsigned long HBS = 0; //HeartBeat Start counter
 unsigned long NOW = 0;

//Dichiarazione di funzione che punta all’indirizzo zero per riavviare sketch
void(* Riavvia)(void) = 0;


 void setup(){
   Serial.begin(9600);    //Initialise Serial communication
   while(Serial.available()) Serial.read(); // empty  out possible garbage from input buffer
   //wait for heartbeat before proceeding
   Serial.println("Waiting for heartbeat");
   while(Serial.available() == 0){}; // wait till serial data is received
   space = Serial.read(); // command is always followed by a space
   while( command != 'h' ) {
     Serial.print("Command not recognized: "); Serial.println(command);
     while( space != ':' ) {
       Serial.print("Space not recognized: "); Serial.println(space);
       while( Serial.available() == 0 ){};
       command = space;
       space = Serial.read(); // command is always followed by a space
     }
     space = "";
   }
   Serial.println("heartbeat received...");
   HBS=micros();          //start hearbeat counter

   DDRD = B00010000; // set PORTD (digital 4) to outputs RF tx + digital 3 tx trigger
   //pinMode(rfTransmitPin, OUTPUT);    
   //pinMode(ledPin, OUTPUT); 
   //pinMode(button, INPUT);
 }
 
 void loop(){
   NOW=micros();
   if( (NOW - HBS) > 30000000 ) {
   // Serial.flush(); // wait for last transmitted data to be sent 
   // Serial.begin(9600); 
   // Serial.println("Serial connection re-established"); 
   // while(Serial.available()) Serial.read(); 
     NOW = micros(); HBS = NOW;
     Serial.println("Riavvio"); delay(1000);
     Riavvia();
   } 
   //else Serial.println(NOW - HBS);
if( Serial.available() )            // if data is available to read
 {
   command = space;
   space = Serial.read();         // read command
//   while( space != ':' ) {
//     while( Serial.available() < 1 ){ delay(1); }
//     command = space;
//     space = Serial.read(); // command is always followed by a space
//   }
   if( space == ':' ) {
     //Serial.println("command received");
     code2send = "";
     if( command == 's' ) { 
      while( Serial.available() < 6 ){ delay(1); }
      for(int i=0; i<6; i++) { delay(5); toDec = (byte) Serial.read() - '0'; if(toDec > 15) toDec -= 7; code2send += hex2bin[toDec]; } //convert string entered in HEX to string in BIN
      Serial.print("SEND command received for code: "); Serial.println(code2send);
      sendCode(); 
    //Serial.flush(); // wait for last transmitted data to be sent 
    //Serial.begin(9600); 
    //Serial.println("Serial connection re-established"); 
    //while(Serial.available()) Serial.read(); 
      NOW = micros(); HBS = NOW;
     }
     if( command == 'h' ) { Serial.println("Heartbeat received"); NOW=micros(); HBS = NOW; }
     if( command == 'l' ) { Serial.println("Listening for sONOFF Signal"); listenForSonOFFsignal(); }
     if( command == 'w' ) { Serial.println("Listening for LightwaveRF Signal"); listenForLightWaveRFsignal(); }
     if( command == 'a' ) { while( Serial.available() < 3 ){ delay(1); }; Alfa=( ((byte) Serial.read() - '0')*100 + ((byte) Serial.read() - '0')*10 + ((byte) Serial.read() - '0')); Serial.println(Alfa); }
     if( command == 'd' ) { while( Serial.available() < 3 ){ delay(1); }; Delay=( ((byte) Serial.read() - '0')*100 + ((byte) Serial.read() - '0')*10 + ((byte) Serial.read() - '0')); Serial.println(Delay); }
     if( command == 'p' ) { while( Serial.available() < 2 ){ delay(1); }; nPulse=( ((byte) Serial.read() - '0')*10 + ((byte) Serial.read() - '0')); Serial.println(nPulse); }
     Serial.println(command + code2send);
   } else {
     //delay(10);
     //Serial.flush();
     Serial.println("Invalid command format! valid format: [char][:][HEX(6)]");
   }
 }

/*  
   buttonVal = digitalRead(button);
  
   if(buttonState>0 && buttonVal==LOW){
//   if(buttonVal==LOW){
     Serial.println("Button NOT Pressed");
     buttonState=0;
   }
   
   buttonVal = digitalRead(button);
   
   if(buttonState<1 && buttonVal==HIGH){
//   if(buttonVal==HIGH){
     Serial.println("Button Pressed");
     //Serial.println("Listening for Signal");
     //initVariables();
     //listenForSignal();
     Serial.println("Sending Signal");
     sendCode();
     buttonState=1;
   }
   
   //delay(1000);
*/   
 }

//lightwaveRF mapping
String byte2nibble(int b) {
  //static byte byte2nibbleMap[16] = {0xF6,0xEE,0xED,0xEB,0xDE,0xDD,0xDB,0xBE,0xBD,0xBB,0xB7,0x7E,0x7D,0x7B,0x77,0x6F};
  char buf[6];
  switch (b)
  {
    case 246:
      return "0";
      break;
    case 238:
      return "1";
      break;
    case 237:
      return "2";
      break;
    case 236:
      return "3";
      break;
    case 222:
      return "4";
      break;
    case 223:
      return "5";
      break;
    case 219:
      return "6";
      break;
    case 190:
      return "7";
      break;
    case 189:
      return "8";
      break;
    case 187:
      return "9";
      break;
    case 183:
      return "A";
      break;
    case 126:
      return "B";
      break;
    case 125:
      return "C";
      break;
    case 123:
      return "D";
      break;
    case 119:
      return "E";
      break;
    case 111:
      return "F";
      break;
    default:
      sprintf(buf, "(%02X)\0", b);
      return buf;
    break;
  }
}
 
 /* ------------------------------------------------------------------------------
     Initialise the array used to store the signal 
    ------------------------------------------------------------------------------*/
 void initVariables(){
   for(int i=0; i<dataSize; i++){
     storedData[i]=0;
   }
   //buttonState=0;
 }
 
 
 /* ------------------------------------------------------------------------------
     Listen for the signal from the RF remote. Blink the RED LED at the beginning to help visualise the process
     And also turn RED LED on when receiving the RF signal 
    ------------------------------------------------------------------------------ */
 void listenForSonOFFsignal() {
   //digitalWrite(ledPin, HIGH);
   //delay(1000);
   //digitalWrite(ledPin,LOW);
   //digitalWrite(ledPin, HIGH);

   syncBit = 0;
   Alfa = 1;

   //Identify the length of the HIGH signal---------------HIGH
   PulseTimeLength = pulseIn(rfReceivePin, HIGH);
   while(PulseTimeLength < 300) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); }  //filter out noise by ignoring short pulses
   //PulseTimeLength = pulseIn(6, HIGH);
   S = micros();
   
   while(storedData[0] < 300 || storedData[0] > 350 || Alfa < 70 || Alfa > 90) {
   //while(syncBit < 30 || syncBit > 33 || Alfa < 70) {

      storedData[0] = PulseTimeLength; 
      PulseTimeLength = pulseIn(rfReceivePin, HIGH); //Identify the length of the HIGH signal---------------HIGH
      while(PulseTimeLength < 300) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); } // filter out noise
      //PulseTimeLength = pulseIn(6, HIGH); //Identify the length of the HIGH signal---------------HIGH
      E = micros();
      storedData[1] = E - S - PulseTimeLength; //Identify the length of the LOW signal---------------LOW
      S = E;

      //syncBit = storedData[1] / storedData[0];
      Alfa = storedData[1] / Delay; //Alfa
      //R = storedData[1] % 124;
   }
   //Alfa = 80;
   //Alfa --;
   //storedData[0] /= Alfa;
   PulseTimeLength *= 10;
   storedData[2] = PulseTimeLength / Alfa;  //first HIGH data pulse

       //Serial.print("HIGH(uS): ");
       //Serial.print(storedData[0]);
       //Serial.print(" LOW(uS): ");
       //Serial.print(storedData[1]); 
       //Serial.print(" Alfa: ");
      // Serial.print(Alfa);
      // Serial.print(" R: ");
      // Serial.println(R);
      // return;
   //Read and store the rest of the signal into the storedData array
   for(int i=3; i<dataSize; i=i+2){

      //Identify the length of the LOW signal---------------LOW
      storedData[i+1] = pulseIn(rfReceivePin, HIGH);
      E = micros();
      storedData[i] = ((E - S - storedData[i+1]) * 10) / Alfa;
      storedData[i+1] *= 10;
      storedData[i+1] /= Alfa;
      S = E;
      
   }   
    //print stored buffer to serial port
    // digitalWrite(ledPin, LOW);
       Serial.print("HIGH(uS): ");
       Serial.print(storedData[0]);
       Serial.print(" LOW(uS): ");
       Serial.print(storedData[1]); 
       Serial.print(" Alfa(uS): ");
       Serial.println(Alfa);
       //Serial.print(" R: ");
       //Serial.println(R);

     R = 2;  

     
/*     for(int i=0; i<dataSize; i++){
      if((i-R)%4 == 0) { Serial.print("["); Serial.print((i-R)/4); Serial.print("]:\t"); }
      if(storedData[i]>100) {
        Serial.print(storedData[i]/3);
        Serial.println("==== SyncBit ====");
        R = i + 1;
      } else { 
       Serial.print(storedData[i]/3);
       Serial.print("\t");
      }
     }
*/
    for(int i=2; i<dataSize; i++){
//      if((i-R)%8 == 0) { Serial.print("["); Serial.print((i-R)/8); Serial.print("]:\t"); } //bit number
      if((i-R)%8 == 0) { Serial.print("\t"); } //bit number
      if(storedData[i] > 155 && storedData[i - 1] > 30) { //sincBit found
        Serial.print("==== SyncBit found H: ");
        Serial.print(storedData[i - 1]);
        Serial.print(" L: ");
        Serial.print(storedData[i]);
        Serial.println(" ====");
        R = i + 1;
      } else { 
       bitCode = (storedData[i++]/30)*1000;
       bitCode += (storedData[i++]/30)*100;
       bitCode += (storedData[i++]/30)*10;
       bitCode += storedData[i]/30;
    switch (bitCode) {
    case 4114:
      Serial.print("10");
      break;
    case 1441:
      Serial.print("01");
      break;
    case 1414:
      Serial.print("00");
      break;
    case 4141:
      Serial.print("11");
      break;
    default: 
      Serial.print("?");
      Serial.print(bitCode);
      Serial.print("?");
      Serial.print(storedData[i-3]/3); Serial.print("-");
      Serial.print(storedData[i-2]/3); Serial.print("-");
      Serial.print(storedData[i-1]/3); Serial.print("-");
      Serial.print(storedData[i]/3); Serial.print("-");
      i = i -3; //was it maybe a synch bit?
    break;
  }
       //Serial.print("\t");
      }
     }
 }

 void listenForLightWaveRFsignal() {

   //Identify the length of the HIGH signal---------------HIGH
   PulseTimeLength = pulseIn(rfReceivePin, HIGH);
   while(PulseTimeLength < 200 || PulseTimeLength > 600) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); }  //wait for a valid pulse
   S = micros();
 while(E != 72) {
   //wait for a valid sequence HIGH-LOW
   while(storedData[0] < 400 || storedData[0] > 600) {

      storedData[0] = PulseTimeLength; // store HIGH TimeLength
      PulseTimeLength = pulseIn(rfReceivePin, HIGH); //Identify the length of the next HIGH signal---------------HIGH
      while(PulseTimeLength < 200) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); } // filter out noise
      E = micros();
      storedData[0] += E - S - PulseTimeLength; //Identify and store the length of the LOW signal---------------LOW
      S = E;
   }

   nPulse = 0;
   Delay = 0;
   //Read and store the rest of the signal into the storedData array
   for(int i=1; i<dataSize; i++){
      //Identify the length of the LOW signal---------------LOW
      PulseTimeLength = pulseIn(rfReceivePin, HIGH);
      while(PulseTimeLength < 200) { PulseTimeLength = pulseIn(rfReceivePin, HIGH); } // filter out noise
      E = micros();
      storedData[i] = PulseTimeLength; //store HIGH pulse TimeLength
      PulseTimeLength = (E - S - PulseTimeLength); //Compute LOW signal time length
      S = E;
      storedData[i] += PulseTimeLength;
      if(storedData[i] < 700) { nPulse++; Delay += storedData[i]; }
      if(PulseTimeLength < 250 || PulseTimeLength > 10000) { E = i; break; } //invalid Pulse Length
   }
  }

   Delay /= nPulse;
   Serial.print(nPulse); Serial.print(" : "); Serial.println(Delay);
   //print stored buffer to serial port
   Serial.print(E); Serial.println(" HIGH(uS) + N x LOW");
   bitCode = 128;
   R = 0;
   for(int i=0; i<=E; i++){
       S = storedData[i] / Delay;
//       if((i % 4) == 0) { Serial.print(": "); Serial.println(toHEX[R]); R = 0; bitCode = 8; } //else Serial.print(" - ");
       if((i % 8) == 0) { Serial.print(byte2nibble(R)); R = 0; bitCode = 128; } //else Serial.print(" - ");
       //Serial.print(storedData[i]);
//       Serial.print("1"); R += bitCode; bitCode = bitCode>>1 ; for(int j=1; j<S; j++) { if((++i % 4) == 0) { Serial.print(": "); Serial.println(byte2nibble(R)); R = 0; bitCode = 128; }; bitCode = bitCode>>1; Serial.print("0"); }; 
       R += bitCode; bitCode = bitCode>>1 ; for(int j=1; j<S; j++) { if((++i % 8) == 0) { Serial.print(byte2nibble(R)); R = 0; bitCode = 128; }; bitCode = bitCode>>1; }
       S = i;
   }
//   if( ++S % 4 ) { R += bitCode; Serial.print("1"); }
   if( ++S % 4 ) { R += bitCode; }
//   while(++S % 4) { Serial.print("0"); }
//   Serial.print(": "); 
   Serial.println(byte2nibble(R)); 
   E = 0;
}
  
 /*------------------------------------------------------------------------------
    Send the stored signal to the FAN/LIGHT's RF receiver. A time delay is required to synchronise
    the digitalWrite timeframe with the 433MHz signal requirements. This has not been tested with different
    frequencies.
    ------------------------------------------------------------------------------ */
 
 
 void sendCode(){
   //digitalWrite(ledPin, HIGH);
   //Alfa = 82;
   //syncP = (nPulse*Alfa)/10;
   //SyncL = Delay*Alfa;
   syncP = 328 + 32; // + errore trasmissione?
   syncL = 10600 - 333; // - errore di trasmissione? 
   ALFAx4  = 328 + 16; // + errore trasmissione?
   ALFAx12 = 984 + 76; // + errore di trasmissione
   for(int j=0; j<4; j++) {
   // Send Sinch Bit
     if(j < 4) {
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(syncP);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(syncL);
     } else {
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       //delayMicroseconds((13*Alfa)/10);
       delayMicroseconds(100); //40+10 errore di trasmissione?
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       //delayMicroseconds((162*Alfa)/10);
       delayMicroseconds(550); //495 + 5 errore di trasmissione?
     }
   for(int i=0; i<24; i=i+2){
       switch(code2send.substring(i,i+2).toInt()) {
         case 0: //00
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(ALFAx4);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(ALFAx12);
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(ALFAx4);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(ALFAx12);
           break;
         case 1: //01
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(ALFAx4);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(ALFAx12);
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(ALFAx12);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(ALFAx4);
           break;
         case 10: //10
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(ALFAx12);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(ALFAx4);
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(ALFAx4);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(ALFAx12);
           break;
         case 11: //11
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(ALFAx12);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(ALFAx4);
       //Send HIGH signal
       PORTD = B00010000; // set digital 4 HIGH;     
       delayMicroseconds(ALFAx12);
       //Send LOW signal
       PORTD = B00000000; // set digital 4 LOW;     
       delayMicroseconds(ALFAx4);
           break;
       } //end switch
     } //end DATA for loop
     //delay(7);
   } //end code repetition for loop
 } // end SENDCODE function
//   digitalWrite(ledPin, LOW);
//   delay(1000);
   
   
   /*-----View Signal in Serial Monitor    
   ---------------------------------- 

   for(int i=0; i<dataSize; i=i+2){
       Serial.println("HIGH,LOW");
       Serial.print(i);
       Serial.print(": ");
       Serial.print(storedData[i]);
       Serial.print(",");
       Serial.println(storedData[i+1]);
   }
 }*/

