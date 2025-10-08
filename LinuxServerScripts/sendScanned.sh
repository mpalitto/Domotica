#!/bin/bash
while true; do
	echo waiting for scanned documents...
	files="$(ls /home/matteo/scannerDrive/scan*.pdf 2>/dev/null)"
	if [ "$files" ]; then
	   echo sending PDF files through email...
	   attach="$(echo $files | sed 's/ / --attach=/g')"
	   sizeT1=$(ls -l /home/matteo/scannerDrive/scan*.pdf | awk '{sum += $5} END {print sum}')
	   sizeT0=$sizeT1
	   sizeDiff=$sizeT1
	   while [ $sizeDiff -gt 0 ]
	   do
		   sleep 10; echo waiting for files to be complitely written from scanner...
		   sizeT1=$(ls -l /home/matteo/scannerDrive/scan*.pdf | awk '{sum += $5} END {print sum}')
		   sizeDiff=$(($sizeT1 - $sizeT0))
		   sizeT0=$sizeT1
	   done
	   mail -s "Documento che hai scannerizzato" --attach=$attach daniela.matteo.nicolo@gmail.com <<< "vedi documento allegato :)Matteo"
	   echo finished sending email
	   rm -f $files
	fi
	#exit
	sleep 10
done
