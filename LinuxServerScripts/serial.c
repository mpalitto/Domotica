#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <termios.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
  
#define BAUDRATE B38400
#define MODEMDEVICE "/dev/ttyUSB0"
#define _POSIX_SOURCE 1 /* POSIX compliant source */
#define FALSE 0
#define TRUE 1
  
volatile int STOP=FALSE; 
 
main()
{
  int fd,c,res,i,j,len,msgLEN;
  struct termios oldtio,newtio;
  char buf[32],msg[32];


  //fd = open(MODEMDEVICE, O_RDWR | O_NOCTTY ); 
  fd = open(MODEMDEVICE, O_RDONLY | O_NOCTTY ); 
  if (fd <0) {perror(MODEMDEVICE); exit(-1); }
  
  tcgetattr(fd,&oldtio); /* save current port settings */
  
  bzero(&newtio, sizeof(newtio));
  newtio.c_cflag = BAUDRATE | CRTSCTS | CS8 | CLOCAL | CREAD;
  newtio.c_iflag = IGNPAR;
  newtio.c_oflag = 0;
  
  /* set input mode (non-canonical, no echo,...) */
  newtio.c_lflag = 0;
   
  newtio.c_cc[VTIME]    = 0;   /* inter-character timer unused */
  newtio.c_cc[VMIN]     = 1;   /* blocking read until 5 chars received */
  
  tcflush(fd, TCIFLUSH);
  tcsetattr(fd,TCSANOW,&newtio);
  
  while (STOP==FALSE) {       /* loop for input */
    buf[0] = 0;
    res = read(fd,buf,32);   /* returns after 1 chars have been input */
    msgLEN=buf[0]+1;
    //len = res;
    len = 0;
    for(i=0;i<res;i++)
    {
      msg[len++] = buf[i];
      if (buf[0]=='z') STOP=TRUE;
    }
    while(len<msgLEN) {
      res = read(fd,buf,32);
      for(i=0;i<res;i++)
      {
        msg[len++] = buf[i];
        if (buf[0]=='z') STOP=TRUE;
      }
    }

    for(i=0;i<len;i++) fprintf(stderr, "%02X", msg[i] & 0xff); fprintf(stderr, ":%d\n",len);
    fflush(stderr);
  }
  tcsetattr(fd,TCSANOW,&oldtio);
}
