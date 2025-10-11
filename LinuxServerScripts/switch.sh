#!/bin/bash

#NOTE: to send codes to RFXCOM (i.e. B1E461) from command line:
#screen /dev/ttyUSB0 38400
#press ^A^D to detach from screen session
#echo -e \\x09\\x13\\x00\\x10\\xb1\\xe4\\x61\\x01\\x57\\xc0\\x02  > /dev/ttyUSB0

#for generating case skeleton
#for name in ${switchName[@]}; do echo $name; done | sed 's/\(.*\)$/\1)\n  echo -n "\1 "\n  case ${SWcode:5} in\n    0)\n      echo "Button 0"\n      ;;\n    1)\n      echo "Button 1"\n      ;;\n    2)\n      echo "Button 2"\n      ;;\n    3)\n      echo "Button 3"\n      ;;\n    4)\n      echo "Button 4"\n      ;;\n    5)\n      echo "Button 5"\n      ;;\n    esac/'

process="$(pgrep switch.sh)"
if [ $(wc -w <<< $process) -gt 1 ]; then echo "switch.sh already running... exiting $process"; exit; fi
#legge configurazione da file e genera un array associativo
unset Switch
declare -A Switch #associative array for easy code reading

#per qualche motivo a me ignoto questa versione non funziona
#sed '/^#/d;s/# \([^ ]\+\).*/\1/;/^$/d' wallSwitches.list | while read code name; do
#   echo "Switch[$code]=$name"
#   Switch[$code]=$name
#done

IDs=($(sed 's/#.*//;/^$/d' $IoTserverScripts/wallSwitches.list))
Names=($(sed '/^#/d;s/.*# \([^ ]\+\).*/\1/;/^$/d' $IoTserverScripts/wallSwitches.list))
n=0
for ID in ${IDs[@]}; do
  echo "Switch[$ID]=${Names[$n]}"
  Switch[$ID]=${Names[$n]}
  echo  "Switch[$ID]}]=${Switch[$ID]}"
  let n++
done

#return
#legge configurazione da file e genera un array associativo
unset sONOFF
declare -A sONOFF #associative array for easy code reading

#per qualche motivo a me ignoto questa versione non funziona
#sed -n "/^V/{s/^V s://;s/\([^ ]\+\) # \([^ ]\+\).*/\2 \1/;p}" $IoTserverScripts/sONOFF.list | while read name code; do 
#  sONOFF[$name]=$code
#done

IDs=($(sed -n "/^V/{s/V s://; s/ .*//; p}" $IoTserverScripts/sONOFF.list))
Names=($(sed -n "/^V/{s/.*# //; s/ - .*//; p}" $IoTserverScripts/sONOFF.list))
n=0
for ID in ${IDs[@]}; do
  #echo "sONOFF[${Names[$n]}]=$ID"
  sONOFF[${Names[$n]}]=$ID
  echo  "sONOFF[${Names[$n]}]=${sONOFF[${Names[$n]}]}"
  let n++
done


# command for sending data through the Arduino: screen -S arduino433tx -X stuff "s:B1E461"
          #screen -S arduino433tx -X stuff "s:${sONOFF[]}"

echo -n > $IoTserverScripts/.lastSwitch
tail -n0 -f $IoTserverScripts/tmp | while read line; do 
  #echo $line
  #Switch="${lastSwitch:1:5}${lastSwitch:9}"
  SWcode="${line:9:5}${line:17:1}"
  selection=""
  if [ "${line:0:6}" == "0A1400" ] && [ ! "$(grep $SWcode $IoTserverScripts/.lastSwitch)" ]; then
     echo "$SWcode" >> $IoTserverScripts/.lastSwitch; (sleep 2 && grep -v $SWcode $IoTserverScripts/.lastSwitch > $IoTserverScripts/.lastSwitch.tmp; mv $IoTserverScripts/.lastSwitch.tmp $IoTserverScripts/.lastSwitch) &

    SWC=${SWcode:0:5}
    SWN=${Switch[${SWcode:0:5}]}
    echo "now serving: $SWC / $SWN"
    case ${Switch[${SWcode:0:5}]} in
   
    S/C-INGRESSO)
      echo -n "S/C-INGRESSO "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[G1G2G3G4-corridoio-principale]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[G9-area-lavandino]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[G7-area-TV]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[G8-area-angolo-vetrata]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[G6-area-divano]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[G5-area-isola-cucina]}"
          ;;
        esac
      ;;
    S/C-LIBRERIA-FRIGO)
      echo -n "S/C-LIBRERIA-FRIGO "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[G1G2G3G4-corridoio-principale]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[P2-area-corridoio]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[G7-area-TV]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[G8-area-angolo-vetrata]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[G9-area-lavandino]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[G5-area-isola-cucina]}"
          ;;
        esac
      ;;
    S/C-COLONNA-CUCINA)
      echo -n "S/C-COLONNA-CUCINA "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[G10-muro-colonna-divano]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[G9-area-lavandino]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[G7-area-TV]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[G8-area-angolo-vetrata]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[G6-area-divano]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[G5-area-isola-cucina]}"
          ;;
        esac
      ;;
    S/C-PORTAFINESTRA-CUCINA)
      echo -n "S/C-PORTAFINESTRA-CUCINA "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[G8-area-angolo-vetrata]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[G12-muro-forno]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[G7-area-TV]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[G1G2G3G4-corridoio-principale]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[G6-area-divano]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[G13-muro-pianoforte]}"
          ;;
        esac
      ;;
    S/C-FUOCHI)
      echo -n "S/C-FUOCHI "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[G11-muro-angolo-cucina]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[G12-muro-forno]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[G7-area-TV]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[G1G2G3G4-corridoio-principale]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[G9-area-lavandino]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[G5-area-isola-cucina]}"
          ;;
        esac;;
    P-CORRIDOIO-PADRONALE)
      echo -n "P-CORRIDOIO-PADRONALE "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[P1-area-letto]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[P4-area-bagno]}"
          ;;
        2)
          echo "Button 2"
          # selection="${sONOFF[Shower]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[G1G2G3G4-corridoio-principale]}"
          ;;
        4)
          echo "Button 4"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[P2-area-corridoio]}"
          ;;
        esac
      ;;
    P-LETTO-MATTEO)
      echo -n "P-LETTO-MATTEO "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[P2-area-corridoio]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[P1-area-letto]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[P6-area-serretta]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[Tree]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[P4-area-bagno]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[Shower]}"
          ;;
        esac
      ;;
    P-LETTO-DANIELA)
      echo -n "P-LETTO-DANIELA "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[P1-area-letto]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[P2-area-corridoio]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[P4-area-bagno]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[P6-area-serretta]}"
          ;;
        4)
          echo "Button 4"
          ;;
        5)
          echo "Button 5"
          ;;
        esac
      ;;
    N-CORRIDOIO)
      echo -n "N-CORRIDOIO "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[G1G2G3G4-corridoio-principale]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[L1-area-lavanderia]}"
          ;;
        2)
          echo "Button 2"
          ;;
        3)
          echo "Button 3"
          ;;
        4)
          echo "Button 4"
          ;;
        5)
          echo "Button 5"
          ;;
        esac
      ;;
    N-INGRESSO)
      echo -n "N-INGRESSO "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[G1G2G3G4-corridoio-principale]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[N1-area-camera]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        esac
      ;;
    N-BAGNO)
      echo -n "N-BAGNO "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[N1-area-camera]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[N2-area-bagno]}"
          ;;
        esac
      ;;
    BL-DISIMPEGNO)
      echo -n "BL-DISIMPEGNO "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[K5-area-bagno]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[L1-area-lavanderia]}"
          ;;
        2)
          echo "Button 2"
          selection="${sONOFF[K4-area-disimpegno]}"
          ;;
        3)
          echo "Button 3"
          selection="${sONOFF[K6-area-letto]}"
          ;;
        4)
          echo "Button 4"
          selection="${sONOFF[K1-area-porta-scalaD-office-Danilea]}"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[K2-area-cucina]}"
          ;;
        esac
      ;;
    BL-LETTO)
      echo -n "BL-LETTO "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          echo selection="${sONOFF[K6-area-letto]}"
          selection="${sONOFF[K6-area-letto]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[K4-area-disimpegno]}"
          ;;
        2)
          echo "Button 2"
          ;;
        3)
          echo "Button 3"
          ;;
        4)
          echo "Button 4"
          ;;
        5)
          echo "Button 5"
          ;;
        esac
      ;;
    BL-STUDIO-MTT)
      echo -n "BL-STUDIO-MTT "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[K1-area-porta-scalaD-office-Danilea]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[K2-area-cucina]}"
          ;;
        2)
          echo "Button 2"
          ;;
        3)
          echo "Button 3"
          ;;
        4)
          echo "Button 4"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[K4-area-disimpegno]}"
          ;;
        esac
      ;;
    TEST|BL-STUDIO-DANY)
      echo -n "BL-STUDIO-DANY "
      case ${SWcode:5} in
        0)
          echo "Button 0"
          selection="${sONOFF[K1-area-porta-scalaD-office-Danilea]}"
          ;;
        1)
          echo "Button 1"
          selection="${sONOFF[K2-area-cucina]}"
          selection="${sONOFF[TEST]}"
          ;;
        2)
          echo "Button 2"
          ;;
        3)
          echo "Button 3"
          ;;
        4)
          echo "Button 4"
          ;;
        5)
          echo "Button 5"
          selection="${sONOFF[K4-area-disimpegno]}"
          ;;
        esac
      ;;
    *) 
       echo "Unknown: $SWcode"
       selection=""
       #screen -S arduino433tx -X stuff "$Switch"
       ;;
    esac
    if [ "$selection" ]; then
      echo screen -S arduino433tx -X stuff '"'s:$selection'"'
      screen -S arduino433tx -X stuff "s:$selection"
      #echo s:$selection >> $IoTserverScripts/.switch.command
      #sleep 1
    else
      echo dismissing code
    fi
  else
    echo "filtering out...$line"
  fi
done
   ##ssh 192.168.43.1 "input tap 156 378"
   ##echo fatto!; echo $n; let "n += 1"
