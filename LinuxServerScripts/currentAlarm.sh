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

# make sure we are using the node.js environment so that 
# the command "node" can be found
. /root/.nvm/nvm.sh  

function toggleAlarm { 
  screen -S arduino433tx -X stuff "s:5EAAC1" 
  echo Alarm $1
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

#questo e il loop principale che implementa la logica
node $IoTserverScripts/currentSocketServer.js | while read line
do 
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
done | tee $fn
