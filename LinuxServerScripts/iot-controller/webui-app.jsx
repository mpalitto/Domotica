        const { useState, useEffect, useRef } = React;

        // API Service
        const API = {
            async loadConfig() {
                try {
                    const response = await fetch('/api/config');
                    return await response.json();
                } catch (error) {
                    console.error('Error loading config:', error);
                    return { areas: {} };
                }
            },

            async saveHouseMap(map) {
                try {
                    const response = await fetch('/api/house-map', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(map)
                    });
                    return await response.json();
                } catch (error) {
                    console.error('Error saving house map:', error);
                    localStorage.setItem('houseMap', JSON.stringify(map));
                    return { success: true, message: 'Saved locally' };
                }
            },

            async loadHouseMap() {
                try {
                    const response = await fetch('/api/house-map');
                    return await response.json();
                } catch (error) {
                    const local = localStorage.getItem('houseMap');
                    return local ? JSON.parse(local) : null;
                }
            },

            async saveRoomConfig(roomId, config) {
                try {
                    const response = await fetch(`/api/room/${roomId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(config)
                    });
                    return await response.json();
                } catch (error) {
                    console.error('Error saving room config:', error);
                    localStorage.setItem(`room_${roomId}`, JSON.stringify(config));
                    return { success: true };
                }
            },

            async loadRoomConfig(roomId) {
                try {
                    const response = await fetch(`/api/room/${roomId}`);
                    return await response.json();
                } catch (error) {
                    const local = localStorage.getItem(`room_${roomId}`);
                    return local ? JSON.parse(local) : { lights: [], furniture: [] };
                }
            },

            async toggleLight(code, state) {
                try {
                    const response = await fetch('/api/light/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, state })
                    });
                    return await response.json();
                } catch (error) {
                    console.error('Error toggling light:', error);
                    return { success: false };
                }
            },

            // Live sonoff switch state. The server polls the eWeLink proxy and
            // pushes a full snapshot over SSE whenever anything changes, so a
            // physical button press shows up here without reloading the page.
            // EventSource reconnects on its own if the stream drops.
            streamStates({ onStates, onStatus }) {
                const source = new EventSource('/api/states/stream');

                source.addEventListener('states', event => {
                    const snapshot = JSON.parse(event.data);
                    const states = {};
                    Object.keys(snapshot.codes || {}).forEach(code => {
                        states[code] = snapshot.codes[code] === 'ON';
                    });
                    onStates(states, snapshot);
                });

                source.onopen = () => onStatus && onStatus(true);
                source.onerror = () => onStatus && onStatus(false);

                return source;
            }
        };

        // Furniture component
        function Furniture({ furniture, editMode, selected, onPositionChange, onRotate, onDelete, onClick, onLabelChange }) {
            const [isDragging, setIsDragging] = useState(false);
            const [isResizing, setIsResizing] = useState(false);
            const [editingLabel, setEditingLabel] = useState('');
            const dragStart = useRef({ x: 0, y: 0, furnitureX: 0, furnitureY: 0 });
            const inputRef = useRef(null);

            useEffect(() => {
                if (selected && inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.select();
                }
            }, [selected]);

            const handleMouseDown = (e) => {
                if (!editMode) return;
                e.stopPropagation();
                onClick(furniture.id);
                setIsDragging(true);
                dragStart.current = {
                    x: e.clientX,
                    y: e.clientY,
                    furnitureX: furniture.x,
                    furnitureY: furniture.y
                };
            };

            const handleResizeStart = (e) => {
                if (!editMode) return;
                e.stopPropagation();
                setIsResizing(true);
                dragStart.current = {
                    x: e.clientX,
                    y: e.clientY,
                    width: furniture.width,
                    height: furniture.height
                };
            };

            useEffect(() => {
                const handleMouseMove = (e) => {
                    if (isDragging) {
                        const deltaX = e.clientX - dragStart.current.x;
                        const deltaY = e.clientY - dragStart.current.y;
                        const newX = Math.round((dragStart.current.furnitureX + deltaX) / 15) * 15;
                        const newY = Math.round((dragStart.current.furnitureY + deltaY) / 15) * 15;
                        onPositionChange(furniture.id, { x: newX, y: newY });
                    } else if (isResizing) {
                        const deltaX = e.clientX - dragStart.current.x;
                        const deltaY = e.clientY - dragStart.current.y;
                        const newWidth = Math.max(30, Math.round((dragStart.current.width + deltaX) / 15) * 15);
                        const newHeight = Math.max(30, Math.round((dragStart.current.height + deltaY) / 15) * 15);
                        onPositionChange(furniture.id, { width: newWidth, height: newHeight });
                    }
                };

                const handleMouseUp = () => {
                    setIsDragging(false);
                    setIsResizing(false);
                };

                if (isDragging || isResizing) {
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                    return () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                    };
                }
            }, [isDragging, isResizing]);

            const handleLabelSubmit = () => {
                if (editingLabel !== furniture.label) {
                    onLabelChange(furniture.id, editingLabel);
                }
            };

            const handleKeyDown = (e) => {
                if (e.key === 'Enter') {
                    handleLabelSubmit();
                    inputRef.current.blur();
                } else if (e.key === 'Escape') {
                    setEditingLabel(furniture.label || '');
                    inputRef.current.blur();
                }
            };

            return (
                <div
                    className={`furniture-box ${selected ? 'selected' : ''}`}
                    style={{
                        left: furniture.x,
                        top: furniture.y,
                        width: furniture.width,
                        height: furniture.height,
                    }}
                    onMouseDown={handleMouseDown}
                >
                    {selected && editMode && (
                        <div className="furniture-label-editor">
                            <input
                                ref={inputRef}
                                type="text"
                                className="furniture-label-input"
                                value={editingLabel !== '' ? editingLabel : (furniture.label || '')}
                                onChange={(e) => setEditingLabel(e.target.value)}
                                onBlur={handleLabelSubmit}
                                onKeyDown={handleKeyDown}
                                placeholder="Enter label..."
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    <span className={`furniture-label ${furniture.rotated ? 'rotated' : ''}`}>
                        {furniture.label || ''}
                    </span>
                    {editMode && (
                        <>
                            <div className="furniture-controls">
                                <button 
                                    className="furniture-btn" 
                                    onClick={(e) => { e.stopPropagation(); onRotate(furniture.id); }}
                                    title="Rotate label"
                                >
                                    ↻
                                </button>
                                <button 
                                    className="furniture-btn delete" 
                                    onClick={(e) => { e.stopPropagation(); onDelete(furniture.id); }}
                                    title="Delete"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="resize-handle" onMouseDown={handleResizeStart} />
                        </>
                    )}
                </div>
            );
        }

        // Room component
        function Room({ room, onSelect, isSelected, editMode, onPositionChange }) {
            const [isDragging, setIsDragging] = useState(false);
            const [isResizing, setIsResizing] = useState(false);
            const dragStart = useRef({ x: 0, y: 0, roomX: 0, roomY: 0 });

            const handleMouseDown = (e) => {
                if (!editMode) {
                    onSelect(room.id);
                    return;
                }
                
                e.stopPropagation();
                setIsDragging(true);
                dragStart.current = {
                    x: e.clientX,
                    y: e.clientY,
                    roomX: room.x,
                    roomY: room.y
                };
            };

            const handleResizeStart = (e) => {
                if (!editMode) return;
                e.stopPropagation();
                setIsResizing(true);
                dragStart.current = {
                    x: e.clientX,
                    y: e.clientY,
                    width: room.width,
                    height: room.height
                };
            };

            useEffect(() => {
                const handleMouseMove = (e) => {
                    if (isDragging) {
                        const deltaX = e.clientX - dragStart.current.x;
                        const deltaY = e.clientY - dragStart.current.y;
                        const newX = Math.round((dragStart.current.roomX + deltaX) / 20) * 20;
                        const newY = Math.round((dragStart.current.roomY + deltaY) / 20) * 20;
                        onPositionChange(room.id, { x: newX, y: newY });
                    } else if (isResizing) {
                        const deltaX = e.clientX - dragStart.current.x;
                        const deltaY = e.clientY - dragStart.current.y;
                        const newWidth = Math.max(100, Math.round((dragStart.current.width + deltaX) / 20) * 20);
                        const newHeight = Math.max(100, Math.round((dragStart.current.height + deltaY) / 20) * 20);
                        onPositionChange(room.id, { width: newWidth, height: newHeight });
                    }
                };

                const handleMouseUp = () => {
                    setIsDragging(false);
                    setIsResizing(false);
                };

                if (isDragging || isResizing) {
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                    return () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                    };
                }
            }, [isDragging, isResizing]);

            return (
                <div
                    className={`room-box ${isSelected ? 'selected' : ''}`}
                    style={{
                        left: room.x,
                        top: room.y,
                        width: room.width,
                        height: room.height,
                    }}
                    onMouseDown={handleMouseDown}
                >
                    {room.name}
                    {editMode && (
                        <div className="resize-handle" onMouseDown={handleResizeStart} />
                    )}
                </div>
            );
        }

        // Light component
        function Light({ light, state, tracked, onToggle, onPositionChange, onRemove, editMode }) {
            const [isDragging, setIsDragging] = useState(false);
            const dragStart = useRef({ x: 0, y: 0, lightX: 0, lightY: 0 });

            const handleMouseDown = (e) => {
                if (!editMode) {
                    onToggle(light.id);
                    return;
                }
                
                e.stopPropagation();
                setIsDragging(true);
                dragStart.current = {
                    x: e.clientX,
                    y: e.clientY,
                    lightX: light.x,
                    lightY: light.y
                };
            };

            const handleRemoveClick = (e) => {
                e.stopPropagation();
                onRemove(light.id);
            };

            useEffect(() => {
                const handleMouseMove = (e) => {
                    if (isDragging) {
                        const deltaX = e.clientX - dragStart.current.x;
                        const deltaY = e.clientY - dragStart.current.y;
                        const newX = Math.round((dragStart.current.lightX + deltaX) / 15) * 15;
                        const newY = Math.round((dragStart.current.lightY + deltaY) / 15) * 15;
                        onPositionChange(light.id, { x: newX, y: newY });
                    }
                };

                const handleMouseUp = () => {
                    setIsDragging(false);
                };

                if (isDragging) {
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                    return () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                    };
                }
            }, [isDragging]);

            return (
                <div
                    className={`light-bulb ${state ? 'on' : 'off'} ${tracked ? '' : 'untracked'}`}
                    style={{
                        left: light.x,
                        top: light.y,
                    }}
                    onMouseDown={handleMouseDown}
                    title={tracked ? light.name : `${light.name} (no live state: RF-only device)`}
                >
                    <div className="light-circle"></div>
                    <span className="light-icon">💡</span>
                    {editMode && (
                        <button 
                            className="light-delete-btn" 
                            onClick={handleRemoveClick}
                            title="Remove light"
                        >
                            ×
                        </button>
                    )}
                    <div className="light-label">{light.name.split('-')[0]}</div>
                </div>
            );
        }

        // Room Editor Modal
        function RoomEditor({ room, onClose, availableLights, onSave, liveStates }) {
            const [editMode, setEditMode] = useState(false);
            const [operatingMode, setOperatingMode] = useState('OPERATIVO'); // 'OPERATIVO' or 'CORREGGI'
            const [lights, setLights] = useState(room.lights || []);
            const [furniture, setFurniture] = useState(room.furniture || []);
            const [selectedFurniture, setSelectedFurniture] = useState(null);
            const [placedLightIds, setPlacedLightIds] = useState(
                new Set((room.lights || []).map(l => l.lightId || l.code))
            );
            const canvasRef = useRef(null);
            const wrapperRef = useRef(null);

            // In OPERATIVO mode the live sonoff state wins over the stored value, so
            // the map follows the real switches. Lights the proxy does not report
            // (RF-only devices) fall back to the stored value.
            // In CORREGGI mode the stored value is used, so the layout can be
            // adjusted freely without the real state overwriting it.
            const isTracked = light => Object.prototype.hasOwnProperty.call(liveStates, light.code);
            const liveStateFor = light =>
                operatingMode === 'OPERATIVO' && isTracked(light)
                    ? liveStates[light.code]
                    : light.state;

            // Calculate zoom to fit
            useEffect(() => {
                if (!editMode && canvasRef.current && wrapperRef.current) {
                    const wrapper = wrapperRef.current;
                    const canvas = canvasRef.current;
                    
                    // Get all items bounds
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    
                    [...furniture, ...lights].forEach(item => {
                        minX = Math.min(minX, item.x);
                        minY = Math.min(minY, item.y);
                        maxX = Math.max(maxX, item.x + (item.width || 50));
                        maxY = Math.max(maxY, item.y + (item.height || 50));
                    });

                    if (minX === Infinity) {
                        // No items, show full canvas
                        minX = 0;
                        minY = 0;
                        maxX = 800;
                        maxY = 600;
                    }

                    const contentWidth = maxX - minX + 100; // Add padding
                    const contentHeight = maxY - minY + 100;
                    
                    const wrapperWidth = wrapper.clientWidth;
                    const wrapperHeight = wrapper.clientHeight;
                    
                    const scaleX = wrapperWidth / contentWidth;
                    const scaleY = wrapperHeight / contentHeight;
                    const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
                    
                    canvas.style.transform = `scale(${scale})`;
                    canvas.style.width = `${contentWidth}px`;
                    canvas.style.height = `${contentHeight}px`;
                    canvas.style.transformOrigin = 'center center';
                } else if (editMode && canvasRef.current) {
                    canvasRef.current.style.transform = 'scale(1)';
                    canvasRef.current.style.width = '100%';
                    canvasRef.current.style.height = '100%';
                    canvasRef.current.style.minWidth = '1200px';
                    canvasRef.current.style.minHeight = '800px';
                }
            }, [editMode, furniture, lights]);

            const handleCanvasClick = () => {
                setSelectedFurniture(null);
            };

            const handleDragOver = (e) => {
                if (!editMode) return;
                e.preventDefault();
            };

            const handleDrop = (e) => {
                if (!editMode) return;
                e.preventDefault();
                
                const data = e.dataTransfer.getData('application/json');
                if (!data) return;

                const dropData = JSON.parse(data);
                const rect = canvasRef.current.getBoundingClientRect();
                const x = Math.round((e.clientX - rect.left) / 15) * 15;
                const y = Math.round((e.clientY - rect.top) / 15) * 15;

                if (dropData.type === 'light') {
                    if (placedLightIds.has(dropData.code)) return;
                    
                    const newLight = {
                        id: Date.now() + Math.random(),
                        lightId: dropData.code,
                        name: dropData.name,
                        code: dropData.code,
                        x: x,
                        y: y,
                        state: false
                    };
                    setLights([...lights, newLight]);
                    setPlacedLightIds(new Set([...placedLightIds, dropData.code]));
                } else if (dropData.type === 'furniture') {
                    const newFurniture = {
                        id: Date.now() + Math.random(),
                        label: '',
                        x: x,
                        y: y,
                        width: 90,
                        height: 60,
                        rotated: false
                    };
                    setFurniture([...furniture, newFurniture]);
                    setSelectedFurniture(newFurniture.id);
                }
            };

            const handleLightPositionChange = (lightId, position) => {
                setLights(lights.map(l => l.id === lightId ? { ...l, ...position } : l));
            };

            const handleLightRemove = (lightId) => {
                const light = lights.find(l => l.id === lightId);
                if (light) {
                    setLights(lights.filter(l => l.id !== lightId));
                    setPlacedLightIds(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(light.lightId || light.code);
                        return newSet;
                    });
                }
            };

            const handleFurniturePositionChange = (furnitureId, changes) => {
                setFurniture(furniture.map(f => f.id === furnitureId ? { ...f, ...changes } : f));
            };

            const handleFurnitureRotate = (furnitureId) => {
                setFurniture(furniture.map(f => 
                    f.id === furnitureId ? { ...f, rotated: !f.rotated } : f
                ));
            };

            const handleFurnitureDelete = (furnitureId) => {
                setFurniture(furniture.filter(f => f.id !== furnitureId));
                if (selectedFurniture === furnitureId) {
                    setSelectedFurniture(null);
                }
            };

            const handleFurnitureLabelChange = (furnitureId, label) => {
                setFurniture(furniture.map(f => 
                    f.id === furnitureId ? { ...f, label } : f
                ));
            };

            const handleToggleLight = async (lightId) => {
                const light = lights.find(l => l.id === lightId);
                if (!light) return;

                const next = !liveStateFor(light);

                // In OPERATIVO mode, send command to server. The expected next
                // state is included so lights whose device cannot report back
                // (RF fallback) get their recorded state updated too.
                if (operatingMode === 'OPERATIVO') {
                    const result = await API.toggleLight(light.code, next ? 'ON' : 'OFF');
                    if (result.success === false) return;
                } else if (operatingMode === 'CORREGGI' && isTracked(light)) {
                    // In CORREGGI mode, user is correcting state - also sync to backend
                    try {
                        await fetch('/api/state/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code: light.code, state: next ? 'ON' : 'OFF' })
                        });
                    } catch (e) {}
                }

                // Optimistic update: the toggle is instant, and the live state
                // pushed by the server reconciles it a moment later.
                setLights(lights.map(l => 
                    l.id === lightId ? { ...l, state: next } : l
                ));
            };

            const handleSave = async () => {
                await API.saveRoomConfig(room.id, { lights, furniture });
                onSave(room.id, lights, furniture);
                setEditMode(false);
                alert('Room configuration saved to map-conf.json!');
            };

            const unplacedLights = availableLights.filter(l => !placedLightIds.has(l.code));

            return (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <div className="modal-header-left">
                                <h2>{room.name}</h2>
                                <button 
                                    className={`btn compact ${editMode ? 'success' : 'secondary'}`}
                                    onClick={() => setEditMode(!editMode)}
                                >
                                    {editMode ? 'Edit Mode' : 'View Mode'}
                                </button>
                                {!editMode && (
                                    <button 
                                        className={`btn compact ${operatingMode === 'OPERATIVO' ? 'operativo' : 'correggi'}`}
                                        onClick={() => setOperatingMode(operatingMode === 'OPERATIVO' ? 'CORREGGI' : 'OPERATIVO')}
                                    >
                                        {operatingMode}
                                    </button>
                                )}
                                {editMode && (
                                    <button className="btn compact success" onClick={handleSave}>
                                        Save
                                    </button>
                                )}
                            </div>
                            <div className="modal-header-right">
                                <div className="mode-indicator">
                                    {editMode ? '✏️ Editing' : (operatingMode === 'OPERATIVO' ? '🟢 Operating' : '🔴 Adjusting')}
                                </div>
                                <button className="modal-close" onClick={onClose}>×</button>
                            </div>
                        </div>
                        <div className="modal-body">
                            <div 
                                ref={wrapperRef}
                                className="room-canvas-wrapper"
                                style={{ 
                                    overflow: editMode ? 'auto' : 'hidden',
                                    width: '100%'
                                }}
                            >
                                <div 
                                    ref={canvasRef}
                                    className="room-canvas"
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    onClick={handleCanvasClick}
                                    style={{
                                        width: editMode ? '100%' : 'auto',
                                        height: editMode ? '100%' : 'auto',
                                        minWidth: editMode ? '1200px' : '0',
                                        minHeight: editMode ? '800px' : '0'
                                    }}
                                >
                                    {furniture.map(f => (
                                        <Furniture
                                            key={f.id}
                                            furniture={f}
                                            editMode={editMode}
                                            selected={selectedFurniture === f.id}
                                            onPositionChange={handleFurniturePositionChange}
                                            onRotate={handleFurnitureRotate}
                                            onDelete={handleFurnitureDelete}
                                            onClick={setSelectedFurniture}
                                            onLabelChange={handleFurnitureLabelChange}
                                        />
                                    ))}
                                    {lights.map(light => (
                                        <Light
                                            key={light.id}
                                            light={light}
                                            state={liveStateFor(light)}
                                            tracked={isTracked(light)}
                                            onToggle={handleToggleLight}
                                            onPositionChange={handleLightPositionChange}
                                            onRemove={handleLightRemove}
                                            editMode={editMode}
                                        />
                                    ))}
                                </div>
                            </div>
                            {editMode && (
                                <div className="lights-sidebar">
                                    <h2>Furniture</h2>
                                    <div
                                        className="available-furniture"
                                        draggable={editMode}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'furniture' }));
                                        }}
                                        style={{ cursor: 'grab' }}
                                    >
                                        <span>📦</span>
                                        <div>Add Furniture</div>
                                    </div>

                                    <div className="section-divider">
                                        <h2>Available Lights</h2>
                                    </div>
                                    {unplacedLights.length === 0 ? (
                                        <p style={{ color: '#888', marginTop: 10, fontSize: 12 }}>All lights placed</p>
                                    ) : (
                                        unplacedLights.map(light => (
                                            <div
                                                key={light.code}
                                                className="available-light"
                                                draggable={editMode}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('application/json', JSON.stringify({
                                                        type: 'light',
                                                        code: light.code,
                                                        name: light.name
                                                    }));
                                                }}
                                                style={{ cursor: 'grab' }}
                                            >
                                                <span>💡</span>
                                                <div>
                                                    <div>{light.name}</div>
                                                    <div className="light-code">{light.code}</div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    
                                    <div className="section-divider">
                                        <h2>Placed Lights</h2>
                                    </div>
                                    {lights.map(light => (
                                        <div key={light.id} className="light-item">
                                            <div>{light.name}</div>
                                            <div className="light-code">{light.code}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // Main App
        function App() {
            const [config, setConfig] = useState(null);
            const [rooms, setRooms] = useState([]);
            const [editMode, setEditMode] = useState(true);
            const [selectedRoom, setSelectedRoom] = useState(null);
            const [status, setStatus] = useState(null);
            const [liveStates, setLiveStates] = useState({});
            const [liveConnected, setLiveConnected] = useState(false);
            const canvasRef = useRef(null);
            const wrapperRef = useRef(null);

            useEffect(() => {
                loadData();
            }, []);

            // Subscribe to live sonoff state. Replaces the whole map whenever the
            // server reports a change, so a press on a physical switch, in the
            // eWeLink app or on another controller is reflected here.
            useEffect(() => {
                const source = API.streamStates({
                    onStates: states => setLiveStates(states),
                    onStatus: connected => setLiveConnected(connected)
                });
                return () => source.close();
            }, []);

            const loadData = async () => {
                const cfg = await API.loadConfig();
                setConfig(cfg);

                const houseMap = await API.loadHouseMap();
                if (houseMap && houseMap.rooms) {
                    setRooms(houseMap.rooms);
                    setEditMode(false);
                }
            };

            // Calculate zoom to fit for house map
            useEffect(() => {
                if (!editMode && canvasRef.current && wrapperRef.current && rooms.length > 0) {
                    const wrapper = wrapperRef.current;
                    const canvas = canvasRef.current;
                    
                    // Get bounds of all rooms
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    
                    rooms.forEach(room => {
                        minX = Math.min(minX, room.x);
                        minY = Math.min(minY, room.y);
                        maxX = Math.max(maxX, room.x + room.width);
                        maxY = Math.max(maxY, room.y + room.height);
                    });

                    const contentWidth = maxX - minX + 100;
                    const contentHeight = maxY - minY + 100;
                    
                    const wrapperWidth = wrapper.clientWidth;
                    const wrapperHeight = wrapper.clientHeight;
                    
                    const scaleX = wrapperWidth / contentWidth;
                    const scaleY = wrapperHeight / contentHeight;
                    const scale = Math.min(scaleX, scaleY, 1);
                    
                    canvas.style.transform = `scale(${scale})`;
                    canvas.style.width = `${contentWidth}px`;
                    canvas.style.height = `${contentHeight}px`;
                    canvas.classList.add('fit-to-screen');
                } else if (editMode && canvasRef.current) {
                    canvasRef.current.style.transform = 'scale(1)';
                    canvasRef.current.style.width = '';
                    canvasRef.current.style.height = '';
                    canvasRef.current.classList.remove('fit-to-screen');
                }
            }, [editMode, rooms]);

            const handleDragOver = (e) => {
                if (!editMode) return;
                e.preventDefault();
            };

            const handleDrop = (e) => {
                if (!editMode) return;
                e.preventDefault();
                
                const areaName = e.dataTransfer.getData('text/plain');
                if (!areaName) return;

                const rect = canvasRef.current.getBoundingClientRect();
                const x = Math.round((e.clientX - rect.left) / 20) * 20;
                const y = Math.round((e.clientY - rect.top) / 20) * 20;

                const newRoom = {
                    id: Date.now() + Math.random(),
                    name: areaName,
                    x: x,
                    y: y,
                    width: 200,
                    height: 200,
                    lights: [],
                    furniture: []
                };
                setRooms([...rooms, newRoom]);
            };

            const handleRoomPositionChange = (roomId, changes) => {
                setRooms(rooms.map(r => r.id === roomId ? { ...r, ...changes } : r));
            };

            const handleSaveMap = async () => {
                const result = await API.saveHouseMap({ rooms });
                setStatus({ type: 'success', message: 'House map saved to map-conf.json!' });
                setTimeout(() => setStatus(null), 3000);
                setEditMode(false);
            };

            const handleRoomSelect = async (roomId) => {
                if (editMode) return;
                
                const room = rooms.find(r => r.id === roomId);
                if (!room) return;
                
                setSelectedRoom(room);
            };

            const handleRoomSave = (roomId, lights, furniture) => {
                setRooms(rooms.map(r => r.id === roomId ? { ...r, lights, furniture } : r));
            };

            if (!config) {
                return <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
            }

            const selectedRoomLights = selectedRoom ? (config.areas[selectedRoom.name] || []) : [];

            return (
                <div className="app">
                    {editMode && (
                        <div className="sidebar">
                            <h2>Room Areas</h2>
                            <div className="room-list">
                                {Object.keys(config.areas).map(areaName => (
                                    <div
                                        key={areaName}
                                        className="room-item"
                                        draggable={editMode}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', areaName);
                                        }}
                                        style={{ cursor: 'grab' }}
                                    >
                                        {areaName}
                                        <div style={{ fontSize: 11, color: '#888', marginTop: 5 }}>
                                            {config.areas[areaName].length} lights
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="canvas-container">
                        <div className="toolbar">
                            <button 
                                className={`btn ${editMode ? 'success' : 'secondary'}`}
                                onClick={() => setEditMode(!editMode)}
                            >
                                {editMode ? 'Edit Mode' : 'View Mode'}
                            </button>
                            {editMode && (
                                <button className="btn success" onClick={handleSaveMap}>
                                    Save House Map
                                </button>
                            )}
                            <div className="mode-indicator" style={{ marginLeft: 'auto' }}>
                                {editMode ? '✏️ Edit House Layout' : '👁️ Click Room to View'}
                            </div>
                            <div className={`live-indicator ${liveConnected ? 'connected' : 'disconnected'}`}>
                                {liveConnected ? '🟢 LIVE' : '⚪ NO LIVE DATA'}
                            </div>
                        </div>
                        <div 
                            ref={wrapperRef}
                            className="canvas-wrapper"
                            style={{ 
                                overflow: editMode ? 'auto' : 'hidden',
                                display: 'flex',
                                alignItems: editMode ? 'flex-start' : 'center',
                                justifyContent: editMode ? 'flex-start' : 'center'
                            }}
                        >
                            <div 
                                ref={canvasRef}
                                className="canvas"
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            >
                                {rooms.map(room => (
                                    <Room
                                        key={room.id}
                                        room={room}
                                        onSelect={handleRoomSelect}
                                        isSelected={selectedRoom?.id === room.id}
                                        editMode={editMode}
                                        onPositionChange={handleRoomPositionChange}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {selectedRoom && (
                        <RoomEditor
                            room={selectedRoom}
                            liveStates={liveStates}
                            onClose={() => setSelectedRoom(null)}
                            availableLights={selectedRoomLights}
                            onSave={handleRoomSave}
                        />
                    )}

                    {status && (
                        <div className={`status-message ${status.type}`}>
                            {status.message}
                        </div>
                    )}
                </div>
            );
        }

        ReactDOM.render(<App />, document.getElementById('root'));
