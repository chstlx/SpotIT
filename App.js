import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
} from 'react-native-reanimated';

const TILE = 60;
const GAP = 4;
const CELL = TILE + GAP * 2;       // 68
const BOARD_SIZE = 5 * CELL;       // 340
const MIN_POS = GAP;               // 4
const MAX_POS = 4 * CELL + GAP;    // 276
const GAME_TIME = 80;
const BEST_KEY = '@best_score';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const isColliding = (a, b) => {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
};

// pick a random grid spot
const randomCellPos = () => ({
  x: Math.floor(Math.random() * 5) * CELL + GAP,
  y: Math.floor(Math.random() * 5) * CELL + GAP,
});

// keep rolling until the spot is not the cursor's tile
const newTargetAvoiding = (cursorX, cursorY) => {
  let spot = randomCellPos();
  while (spot.x === cursorX && spot.y === cursorY) {
    spot = randomCellPos();
  }
  return spot;
};

// hits = the current score. Each hit shrinks the color difference
// by 3, and the smallest difference is 8
const makeColors = (hits) => {
  const r = Math.floor(Math.random() * 200);
  const g = Math.floor(Math.random() * 200);
  const b = Math.floor(Math.random() * 200);
  const diff = Math.max(8, 52 - hits * 3);
  return {
    base: 'rgb(' + r + ', ' + g + ', ' + b + ')',
    target: 'rgb(' + (r + diff) + ', ' + (g + diff) + ', ' + (b + diff) + ')',
  };
};

function HomeScreen({ navigation }) {
  const [name, setName] = useState('');
  const [best, setBest] = useState(0);
  const [loadError, setLoadError] = useState('');

  // loads when Home first opens. BACK TO HOME uses replace,
  // so a new Home screen runs this again
  useEffect(() => {
    const loadBest = async () => {
      try {
        const stored = await AsyncStorage.getItem(BEST_KEY);
        if (stored !== null) setBest(parseInt(stored, 10));
        setLoadError('');
      } catch (e) {
        console.log('Load error:', e);
        setLoadError('Could not load best score. Showing 0.');
      }
    };

    loadBest();
  }, []);

  return (
    <View style={styles.home}>
      <Text style={styles.title}>Spot the Different Color</Text>
      <Text style={styles.label}>
        Use the buttons to move from different directions to get the odd one.
      </Text>
      <Text style={styles.best}>BEST: {best}</Text>
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
      <Text style={styles.label}>Enter your name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor="#888"
      />
      <Button
        title="START"
        onPress={() =>
          navigation.navigate('Game', { name: name.trim() || 'Player' })
        }
      />
    </View>
  );
}

function GameScreen({ route, navigation }) {
  const { name } = route.params;

  const [score, setScore] = useState(0);
  const [time, setTime] = useState(GAME_TIME);
  const [gameOver, setGameOver] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [colors, setColors] = useState(makeColors(0));

  const [x, setX] = useState(GAP);
  const [y, setY] = useState(GAP);

  const [targetX, setTargetX] = useState(2 * CELL + GAP);
  const [targetY, setTargetY] = useState(2 * CELL + GAP);

  // cursor glide
  const cx = useSharedValue(GAP);
  const cy = useSharedValue(GAP);

  // cursor pulse
  const pulse = useSharedValue(1);

  const cursorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cx.value },
      { translateY: cy.value },
      { scale: pulse.value },
    ],
  }));

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.15, { duration: 600 }), -1, true);
  }, []);

  useEffect(() => {
    cx.value = withTiming(x, { duration: 150 });
    cy.value = withTiming(y, { duration: 150 });
  }, [x, y]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(prevTime => (prevTime > 0 ? prevTime - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (time === 0) {
      setGameOver(true);
    }
  }, [time]);

  // save the high score once, when the game ends
  useEffect(() => {
    if (!gameOver) return;

    const saveBest = async () => {
      try {
        const stored = await AsyncStorage.getItem(BEST_KEY);
        const best = stored !== null ? parseInt(stored, 10) : 0;
        if (score > best) {
          await AsyncStorage.setItem(BEST_KEY, String(score));
        }
        setSaveError('');
      } catch (e) {
        console.log('Save error:', e);
        setSaveError('Could not save high score.');
      }
    };

    saveBest();
  }, [gameOver]);

  // collision: a hit scores, then makes a new round with closer colors
  useEffect(() => {
    if (gameOver) return;

    const cursor = { x: x, y: y, width: TILE, height: TILE };
    const target = { x: targetX, y: targetY, width: TILE, height: TILE };

    if (isColliding(cursor, target)) {
      setScore(prev => prev + 1);
      setColors(makeColors(score + 1));
      const spot = newTargetAvoiding(x, y);
      setTargetX(spot.x);
      setTargetY(spot.y);
    }
  }, [x, y, targetX, targetY]);

  const moveLeft = () => {
    if (!gameOver) setX(prev => clamp(prev - CELL, MIN_POS, MAX_POS));
  };
  const moveRight = () => {
    if (!gameOver) setX(prev => clamp(prev + CELL, MIN_POS, MAX_POS));
  };
  const moveUp = () => {
    if (!gameOver) setY(prev => clamp(prev - CELL, MIN_POS, MAX_POS));
  };
  const moveDown = () => {
    if (!gameOver) setY(prev => clamp(prev + CELL, MIN_POS, MAX_POS));
  };

  // PLAY AGAIN: reset everything, including colors
  const restart = () => {
    setScore(0);
    setColors(makeColors(0));
    setTime(GAME_TIME);
    setGameOver(false);
    setSaveError('');
    setX(GAP);
    setY(GAP);
    const spot = newTargetAvoiding(GAP, GAP);
    setTargetX(spot.x);
    setTargetY(spot.y);
  };

  const tileStyle = [styles.tile, { backgroundColor: colors.base }];

  return (
    <View style={styles.gameArea}>
      <Text style={styles.nameText}>PLAYER: {name}</Text>

      <View style={styles.hud}>
        <Text style={styles.hudText}>SCORE: {score}</Text>
        <Text style={styles.hudText}>TIME: {time}</Text>
      </View>

      <View style={styles.board}>
        <View style={styles.row}>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
        </View>
        <View style={styles.row}>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
        </View>
        <View style={styles.row}>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
        </View>
        <View style={styles.row}>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
        </View>
        <View style={styles.row}>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
          <View style={tileStyle}/>
        </View>

        <View style={[styles.target, { left: targetX, top: targetY, backgroundColor: colors.target }]} />

        <Animated.View style={[styles.cursor, cursorStyle]} />

        {gameOver && (
          <View style={styles.overlay}>
            <Text style={styles.gameOverText}>GAME OVER</Text>
            <Text style={styles.finalScore}>Final score: {score}</Text>
            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
            <View style={styles.overlayButtons}>
              <View style={styles.overlayBtn}>
                <Button title="PLAY AGAIN" onPress={restart} />
              </View>
              <View style={styles.overlayBtn}>
                <Button title="BACK TO HOME" onPress={() => navigation.replace('Home')} />
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <Button title="LEFT" onPress={moveLeft} />
        <Button title="RIGHT" onPress={moveRight} />
        <Button title="UP" onPress={moveUp} />
        <Button title="DOWN" onPress={moveDown} />
      </View>
    </View>
  );
}

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Game" component={GameScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  home: {
    flex: 1,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    color: 'white',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  best: {
    color: '#5fd592',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  label: {
    color: 'white',
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  input: {
    width: 240,
    height: 44,
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  errorText: {
    color: '#ffb3b3',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  gameArea: {
    flex: 1,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameText: {
    color: '#5fd592',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  hud: {
    width: BOARD_SIZE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hudText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  board: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
  },
  row: {
    flexDirection: 'row',
  },
  tile: {
    width: TILE,
    height: TILE,
    margin: GAP,
    borderRadius: 10,
  },
  target: {
    position: 'absolute',
    width: TILE,
    height: TILE,
    borderRadius: 10,
  },
  cursor: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TILE,
    height: TILE,
    borderRadius: 10,
    borderWidth: 4,
    borderColor: 'white',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  gameOverText: {
    color: 'red',
    fontSize: 36,
    fontWeight: 'bold',
  },
  finalScore: {
    color: 'white',
    fontSize: 20,
    marginTop: 10,
  },
  overlayButtons: {
    marginTop: 16,
  },
  overlayBtn: {
    marginBottom: 10,
  },
  controls: {
    width: BOARD_SIZE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
});