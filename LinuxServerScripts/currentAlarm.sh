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
ALEXA_LEVEL="${ALEXA_ALARM_LEVEL:-9}"       # volume 0-10 durante l'allarme
alexaLog="$IoTserverScripts/.alarm_alexa.log"
alexaSeq=0
alexaFlag=""
alexaPid=""

# esegue un comando nel container CT106 passando da pve (.33)
function alexaRemote {
  timeout "$ALEXA_TIMEOUT" ssh -o BatchMode=yes -o ConnectTimeout=5 root@192.168.1.33 "$1"
}

function alexaSpeak {
  if ! alexaRemote "pct exec 106 -- /usr/local/bin/alexacli speak \"$ALEXA_TEXT\" -d \"$ALEXA_DEVICE\"" >>"$alexaLog" 2>&1; then
    echo "$(date '+%F %T') Alexa speak FAILED (device=$ALEXA_DEVICE)" >>"$alexaLog"
  fi
}

# volume attuale in percentuale (0-100), vuoto se non disponibile
function alexaGetVolume {
  alexaRemote "pct exec 106 -- /usr/local/bin/alexa-volume \"$ALEXA_DEVICE\" --level" 2>/dev/null | tr -dc '0-9'
}

# imposta il volume: $1 = livello 0-10 (la scala dei comandi vocali)
function alexaSetLevel {
  alexaRemote "pct exec 106 -- /usr/local/bin/alexacli command \"volume $1\" -d \"$ALEXA_DEVICE\"" >>"$alexaLog" 2>&1
}

# Alza il volume, ripete la frase ogni ALEXA_PAUSE secondi finche' il file flag
# esiste, poi rimette il volume di prima.
# Lo stop NON uccide la ripetizione in corso: la frase viene finita di dire
# (altrimenti un rientro rapido dell'allarme tronca l'annuncio a meta') ed e'
# il loop stesso a ripristinare il volume quando esce.
function alexaStart {
  [ -n "$ALEXA_TEXT" ] || return
  alexaStop
  alexaSeq=$((alexaSeq + 1))
  alexaFlag="/tmp/currentAlarm.alexa.$$.$alexaSeq"
  touch "$alexaFlag"
  (
    flag="$alexaFlag"
    restore=""
    if [ -e "$flag" ]; then
      prev=$(alexaGetVolume)
      if [ -n "$prev" ] && [ "$prev" -lt $((ALEXA_LEVEL * 10)) ]; then
        echo "$(date '+%F %T') volume $prev -> $((ALEXA_LEVEL * 10)) for the alarm" >>"$alexaLog"
        alexaSetLevel "$ALEXA_LEVEL"
        restore="$prev"
        sleep 2   # lascia applicare il volume prima del primo annuncio
      fi
    fi
    while [ -e "$flag" ]; do
      echo "$(date '+%F %T') alarm on -> Alexa($ALEXA_DEVICE)" >>"$alexaLog"
      alexaSpeak
      sleep "$ALEXA_PAUSE"
    done
    # ripristina solo se nel frattempo non e' partito un altro allarme
    if [ -n "$restore" ] && ! ls /tmp/currentAlarm.alexa.$$.* >/dev/null 2>&1; then
      alexaSetLevel $(( (restore + 5) / 10 ))
      echo "$(date '+%F %T') volume restored to $restore" >>"$alexaLog"
    fi
  ) &
  alexaPid=$!
}

function alexaStop {
  [ -n "$alexaFlag" ] && rm -f "$alexaFlag"
  alexaFlag=""
  alexaPid=""
}

trap 'alexaStop; rm -f /tmp/currentAlarm.alexa.$$.*' EXIT INT TERM HUP

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
