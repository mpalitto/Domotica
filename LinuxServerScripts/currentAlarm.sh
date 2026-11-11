#!/bin/bash
# Avvia il currentSocketServer a cui si collega automaticamente il nodeMCU
# misuratore di corrente.
# Quando viene raggiunta una certa soglia l'allarme viene acceso
# quando scende al di sotto della soglia-10 l'allarme viene spento
# i valori vengono salvati in un log file il cui nome viene passato tramite
#
# UPDATE: La nuova versione invia al display la misura della corrente
#
# N.B. dovrebbe essere usato startCurrentAlarm.sh per avviarlo
# N.B. dovrebbe essere avviato una volta al giorno as crontab job

PORT=12345

# --- Allarme vocale su Alexa -------------------------------------------------
# alexacli gira nel container CT106 su pve (192.168.1.33). Il container non ha
# sshd, quindi si passa da pve con "pct exec". .77 deve poter fare ssh root@.33
# (chiave in authorized_keys + host key in known_hosts).
ALEXA_DEVICE="${ALEXA_ALARM_DEVICE:-living}"
ALEXA_TEXT="${ALEXA_ALARM_TEXT:-Daniela, Daniela, Daniela! Alarm, Alarm, Alarm!!!}"
ALEXA_PAUSE="${ALEXA_ALARM_PAUSE:-5}"       # secondi tra due ripetizioni
ALEXA_TIMEOUT="${ALEXA_ALARM_TIMEOUT:-20}"  # timeout della singola chiamata
alexaLog="$IoTserverScripts/.alarm_alexa.log"
alexaFlag="/tmp/currentAlarm.alexa.$$"
alexaPid=""

function alexaSpeak {
  if ! timeout "$ALEXA_TIMEOUT" ssh -o BatchMode=yes -o ConnectTimeout=5 root@192.168.1.33 \
       "pct exec 106 -- /usr/local/bin/alexacli speak \"$ALEXA_TEXT\" -d \"$ALEXA_DEVICE\"" >>"$alexaLog" 2>&1; then
    echo "$(date '+%F %T') Alexa speak FAILED (device=$ALEXA_DEVICE)" >>"$alexaLog"
  fi
}

# ripete la frase ogni ALEXA_PAUSE secondi finche' il file flag esiste
function alexaStart {
  [ -n "$ALEXA_TEXT" ] || return
  alexaStop
  touch "$alexaFlag"
  (
    while [ -e "$alexaFlag" ]; do
      echo "$(date '+%F %T') alarm on -> Alexa($ALEXA_DEVICE)" >>"$alexaLog"
      alexaSpeak
      sleep "$ALEXA_PAUSE"
    done
  ) &
  alexaPid=$!
}

function alexaStop {
  rm -f "$alexaFlag"
  if [ -n "$alexaPid" ]; then
    command -v pkill >/dev/null && pkill -TERM -P "$alexaPid" 2>/dev/null
    kill "$alexaPid" 2>/dev/null
    wait "$alexaPid" 2>/dev/null
    alexaPid=""
  fi
}

trap alexaStop EXIT INT TERM

function toggleAlarm { 
  screen -S arduino433tx -X stuff "s:5EAAC1" 
  echo Alarm $1
  if [ "$1" = "on" ]; then alexaStart; else alexaStop; fi
}

alarm="off"
c=0

#logfn e il log file name, la variabile viene definita nella shell
#con il comando: export logfn="$IoTserverScripts/.current_$(date +%d-$m-%Y).log"
logfn="$IoTserverScripts/.current_$(date +%d-%m-%Y).log"

#se il file logfn.0 esiste gia vuol dire che ce stata almeno una interruzione
#e quindi rinominiamo il file in modo che se esiste logfn.N, allora fn sara 
#logfn.N+1
if [ -e "$logfn.0" ]; then 
	fn="$(echo $logfn.*)" #la lista di tutti i log file di quel giorno
	fn=${fn//* /} #ultimo file della lista
	let n=${fn#$logfn.}+1 #ricavo N+1
	fn="$logfn.$n" #il nuovo file name $logfn.N+1
else
	fn="$logfn.0"
fi

#il valore del trigger e di default 333 se non fornito da linea di comando
if [ $# -gt 0 ]; then triggerON=$1
else triggerON=333
fi
let triggerOFF=triggerON-10

echo "TCP server listening on port $PORT (trigger ON=$triggerON OFF=$triggerOFF)"

#questo e il loop principale che implementa la logica
while read line
do 
   # Skip empty lines
   [ -z "$line" ] && continue
   
   p=$c
   c=${line//* /}
   echo "$(date +%H:%M:%S) p=$p c=$c"
   screen -S displayServer -X stuff "$c\n" # invia la misura della corrente al display
   if [ $alarm = "off" ]; then
        if [ $p -le $triggerON ] && [ $c -gt $triggerON ]; then 
          alarm="on"
          toggleAlarm on
        fi
   else 
        if [ $p -ge $triggerOFF ] && [ $c -lt $triggerOFF ]; then 
          alarm="off"
          toggleAlarm off
        fi
   fi 
done < <(socat TCP4-LISTEN:$PORT,reuseaddr,fork STDOUT 2>/dev/null | while IFS= read -r -d ':' chunk; do echo -n "$chunk" | sed 's/nodeMCU-currentSensor/\nnodeMCU-currentSensor/g'; done) | tee $fn
