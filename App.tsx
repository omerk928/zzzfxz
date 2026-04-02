import React, { useState } from 'react';
import { AppState, Level } from './types';
import LevelSelectionScreen from './screens/LevelSelectionScreen';
import ConversationScreen from './screens/ConversationScreen';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('level-selection');
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);

  const handleLevelSelect = (level: Level) => {
    setSelectedLevel(level);
  };

  const handleStartPractice = () => {
    if (selectedLevel) {
      setAppState('conversation');
    }
  };

  return (
    <div className="w-full h-screen font-sans text-gray-800">
      {appState === 'level-selection' && (
        <LevelSelectionScreen
          selectedLevel={selectedLevel}
          onLevelSelect={handleLevelSelect}
          onStartPractice={handleStartPractice}
        />
      )}
      {appState === 'conversation' && selectedLevel && (
        <ConversationScreen level={selectedLevel} />
      )}
    </div>
  );
};

export default App;
