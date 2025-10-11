#!/bin/bash
if [ "$1" != "apri" ] && [ "$1" != "chiudi" ]; then
  echo "usage: tapparella.sh chiudi|apri"
  echo 'I have received: "'$1'"'
  exit
fi
status="$(< $IoTserverScripts/.tapparella.status)"
echo "stato attuale: "$status
if [ "$status" = "chiusa" ] && [ "$1" = "apri" ]; then
echo "tapparella in apertura"
# Apri serrande
screen -S arduino433tx -X stuff "s:5EA5A1" # aziona rele1
echo 'mezzomezzo' > $IoTserverScripts/.tapparella.status
 (sleep 10; screen -S arduino433tx -X stuff "s:5EA5A1"; echo 'aperta' > $IoTserverScripts/.tapparella.status; echo "tapparella sono aperte") &
elif [ "$status" = "aperta" ] && [ "$1" = "apri" ]; then
  echo "Tapparella gia aperta"
elif [ "$status" = "aperta" ] && [ "$1" = "chiudi" ]; then
echo "tapparella in chiusura"
# Chiudi serrande
screen -S arduino433tx -X stuff "s:5EA551"
echo 'mezzomezzo' > $IoTserverScripts/.tapparella.status
(sleep 10; screen -S arduino433tx -X stuff "s:5EA551"; echo 'chiusa' > $IoTserverScripts/.tapparella.status; echo "tapparella sono chiuse") &
elif [ "$status" = "chiusa" ] && [ "$1" = "chiudi" ]; then
  echo "Tapparella gia chiusa"
else
 echo "Error: unexpected inputs: status=$status request=$1"
fi

