```
BUTTON2SONOFF/
├── README.md			          (documentation)
├── switch.sh                     (main code)
├── preprocess_template.sh        (template file for receiving new buttons format)
├── preprocess_rfxcom.sh          (script for receiving RFXCOM buttons format)
├── preprocess_kinetic.sh         (script for receiving KINETIC buttons format)
├── sONOFF.list                   (list of sONOFF names and theirs associated RF codes)
└── wallSwitches.list             (list of Wall Switch and with related buttons mapping to sONOFF devices' names)
```
## Flow Diagram
```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ RFXCOM Switch 1  │ │ RFXCOM Switch N  │ │ kinetic Switch 1 │ │ kinetic Switch M │
│                  │ │                  │ │                  │ │                  │
│ 0A1400...B1E46   │ │ 0A1400...C12D3   │ │ KINETIC AB6EDE...│ │ KINETIC CC1EF2...│
│      ↓           │ │      ↓           │ │      ↓           │ │      ↓           │
│ Button 1,2,3,... │ │ Button 1,2,3,... │ │ Button 1,...     │ │ Button 1,...     │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
          │                    │                    │                    │
          └────────────────────┘                    └────────────────────┘
                    │                                         │
                    ▼                                         ▼
          ┌────────────────────┐                    ┌────────────────────┐
          │ RFXCOM RF Rx       │                    │ KINETIC RF Rx      │
          └────────────────────┘                    └────────────────────┘
                    │                                         │
                    ▼                                         ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │             tmp-files/buttonPress.log file                      │
        │  (receives raw data from RFXCOM, KINETIC, future devices)       │
        └─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    switch.sh (Main Script)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              detect_source_type()                         │  │
│  │   Detects: RFXCOM (0A1400...), KINETIC (KINETIC...), etc. │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ preprocess_      │ │ preprocess_      │ │ preprocess_      │
│ rfxcom.sh        │ │ kinetic.sh       │ │ [future].sh      │
│                  │ │                  │ │                  │
│ 0A1400...        │ │ KINETIC AB6EDE...│ │ [custom format]  │
│      ↓           │ │      ↓           │ │      ↓           │
│ B1E46 1 RFXCOM   │ │ AB6EDE 1 KINETIC │ │ ID BTN TYPE      │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          │                    │                    │
          └────────────────────┼────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  UNIVERSAL FORMAT   │
                    │  ID BTN SOURCE_TYPE │
                    └─────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   process_switch_event()                        │
│  Routes to appropriate handler based on switch name             │
│  Sends commands to Arduino via screen session                   │
└─────────────────────────────────────────────────────────────────┘
```
## To ADD a NEW Switch
### modify the wallSwitches.list and add the following format
```
NEWSW1 # MY-NEW-SWITCH description
    button 0: G1G2G3G4-corridoio-principale
    button 1: P4-area-bagno
    button 2: N2-area-bagno
```

### Architecture
```
┌─────────────────────────────────────────────────────────────────────┐
│                      wallSwitches.list                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 4AA03 # S/C-INGRESSO                                        │    │
│  │     button 0: G1G2G3G4-corridoio-principale                 │    │
│  │     button 1: G9-area-lavandino                             │    │
│  │     ...                                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         switch.sh                                   │
│  ┌────────────────────┐    ┌────────────────────────────────────┐   │
│  │ Switch[ID] = NAME  │    │ ButtonMap[ID:BTN] = TARGET_NAME    │   │
│  │ -----------------  │    │ -------------------------------    │   │
│  │ 4AA03 = S/C-INGR.. │    │ 4AA03:0 = G1G2G3G4-corridoio...    │   │
│  │ AB6EDE = KINETIC.. │    │ 4AA03:1 = G9-area-lavandino        │   │
│  │ ...                │    │ AB6EDE:1 = P4-area-bagno           │   │
│  └────────────────────┘    │ ...                                │   │
│                            └────────────────────────────────────┘   │
│                                        │                            │
│  get_button_action(ID, BTN) ───────────┘                            │
│           │                                                         │
│           ▼                                                         │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     sONOFF[NAME] = CODE                        │ │
│  │  G1G2G3G4-corridoio-principale = B1E461                        │ │
│  │  P4-area-bagno = C2F572                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│           │                                                         │
│           ▼                                                         │
│  send_arduino_command("s:B1E461")                                   │
└─────────────────────────────────────────────────────────────────────┘
```
