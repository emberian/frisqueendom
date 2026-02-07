# Audio Design

## Philosophy

FrisQueendom inherits Booty Hunt's fully procedural audio engine -- zero audio files, everything synthesized in real-time using the Web Audio API. This is both a technical constraint and a creative opportunity. The sounds of ultimate frisbee are uniquely satisfying and underexplored in games.

## Sound Categories

### 1. Disc Sounds

The disc itself produces characteristic sounds that experienced players know intimately:

**Throw Release**
```
Backhand:
  - Whoosh: low-pass filtered noise burst (0.1s)
  - Pitch proportional to throw speed (faster = higher)
  - Subtle "click" at release (disc leaving fingers)

Forehand:
  - Sharper, higher-pitched whoosh (more wrist snap energy)
  - Distinct "snap" at release (forehand grip releases differently)
  - Slightly shorter duration than backhand

Hammer:
  - Pronounced "whip" sound (overhead motion)
  - Lower initial pitch (arm motion starts slow)
  - Rising pitch as the arm accelerates over

Scoober:
  - Soft upward whoosh
  - Gentle release sound
  - Almost comical compared to other throws (fitting)
```

**Disc In Flight**
```
  - Continuous whistle/hum: proportional to disc speed
  - Frequency: 200-800 Hz based on speed
  - Amplitude: increases with speed
  - Flutter: if disc has OAT (wobble), add amplitude modulation at wobble frequency
  - The wind interaction: slight pitch variation as wind speed changes
  - Doppler shift as disc passes the camera
```

**Catch**
```
  Pancake catch:
    - Soft "thwap" (disc hitting palm)
    - Brief white noise burst, band-passed
    - Satisfying, meaty sound

  Clap catch:
    - Sharper "clap" (two hands)
    - Higher pitch than pancake
    - Quick decay

  One-hand catch:
    - "Crack" (fingers on rim)
    - Brief, sharp transient
    - Stylish sound matches the visual

  Layout catch:
    - Catch sound + body-on-grass sound
    - Sliding sound (filtered noise, 0.3-0.5s)
    - Grunt on impact (synthesized voice)

  Missed catch (drop):
    - Disc hitting ground: "thunk" or "skip" depending on angle
    - No satisfying catch sound (absence is the punishment)
```

**Disc on Ground**
```
  Landing on grass:
    - Dull thud (low frequency noise burst)
    - If rolling: rumble (low freq, periodic amplitude modulation)

  Skip (bounce):
    - Impact thud + brief higher-pitched "tink"
    - Slightly metallic quality (disc plastic vibrating)

  Sliding to stop:
    - Scraping friction sound (filtered noise, descending pitch)
    - Duration proportional to initial speed
```

### 2. Player Sounds

**Footsteps**
```
  Grass footsteps:
    - Soft "tsh" sounds (filtered noise, short)
    - Frequency synced to run cycle animation phase
    - Louder when sprinting
    - Varied slightly each step (3-4 variants via parameter randomization)

  Cutting:
    - Louder, sharper footstep on plant foot
    - Brief "skrrt" sound on direction change (rubber on grass)
    - Grass tearing particles = grass tearing sound

  Jumping:
    - Single strong footstep on takeoff
    - Whoosh of body through air
    - Impact on landing (thud + footstep)

  Layout:
    - Takeoff footstep
    - Body whoosh
    - THUD on landing (significant low-freq impact)
    - Grass slide (friction noise, 0.5-1.0s)
    - Grunt on impact
```

**Vocals (Synthesized)**
```
  All vocalizations are procedurally synthesized (no recordings):

  "Stall count" calls by the mark:
    - Synthesized voice counting 1-10
    - Generated via formant synthesis (vowel shapes)
    - Increasingly urgent tone as count rises
    - Each defender has a slightly different voice (pitch/timbre variation)

  Calls:
    - "Up!" (disc is in the air) -- short, sharp syllable
    - "Strike!" (force direction call) -- barked command
    - "No huck!" (defense call) -- warning
    - General chatter: low murmur of synthesized speech (ambient)

  Effort sounds:
    - Sprint grunts (brief, low)
    - Jump exertion (short "huh")
    - Layout impact grunt (louder)
    - Catch satisfaction ("ha!")

  Celebration:
    - Cheering (layered noise with formant filtering)
    - "Yeah!" type exclamations
    - Clapping (sharp noise bursts)
```

### 3. Environment Sounds

**Wind**
```
  - Base layer: brown noise, low-pass filtered
  - Filter cutoff proportional to wind speed (higher speed = higher cutoff)
  - Volume proportional to wind speed
  - Gusts: brief increases in volume and cutoff (envelope followers on gust events)
  - Directionality: spatial audio, wind is louder on the windward side
  - Grass rustling: high-passed noise layer on top, modulated by wind speed
```

**Ambient**
```
  Park setting:
    - Bird songs (synthesized oscillators with trills)
    - Distant traffic (low rumble)
    - Dog barking (occasional, distant)
    - Other games in the background (faint disc/shout sounds)

  Tournament setting:
    - Crowd murmur (layered noise with human-voice filtering)
    - PA announcements (muffled synthesized speech)
    - Music from other fields (distant beat)
    - Tents flapping (periodic noise)

  Stadium setting:
    - Large crowd ambiance (massive noise layer)
    - Crowd reactions to plays (volume swell on big moments)
    - Stadium PA (echoed announcements)
    - Bass-heavy atmosphere
```

**Rain**
```
  - White noise with specific filtering for rain character
  - Individual raindrop impacts (high-frequency pings, random timing)
  - Splashing (when players run through puddles)
  - Thunder (low-freq rumble + sharp crack for lightning)
```

### 4. UI Sounds

```
  Menu navigation: soft click (short sine wave)
  Menu selection: brighter click + subtle harmonic
  Score: triumphant ascending tones (major chord arpeggio)
  Turnover: descending tone (brief, not punishing)
  Timeout: whistle (synthesized, piercing)
  Foul call: sharp tone (attention-getting)
  Game start/end: horn blast
  Clock ticking: subtle metronome (when time is running out)
```

### 5. Music System

FrisQueendom uses a dynamic procedural music system:

**Layers**
```
The music is built from layers that fade in/out based on game state:

Layer 1: Ambient pad (always present, very soft)
  - Evolving chord, slow filter sweep
  - Major key during good moments, minor during tense ones

Layer 2: Rhythm (activates during active play)
  - Syncopated beat
  - Tempo matches pace of play (faster during active point, slower during setup)
  - Kick drum, hi-hat, snare (all synthesized)

Layer 3: Melodic (activates during big moments)
  - Short melodic phrases
  - Triggered on scores, big plays
  - Variations to avoid repetition

Layer 4: Intensity (activates in close games, late in matches)
  - Additional percussion
  - Filter automation (opening up the sound)
  - Bass line becomes more prominent
  - Creates tension and excitement
```

**Dynamic Mixing**
```
Game state → Music parameters:

  Between points: Layers 1 only. Peaceful. Reset.
  Pull/setup: Layers 1+2. Building anticipation.
  Active play: Layers 1+2+3. Full engagement.
  Big moment: All layers. Maximum intensity.
  Score: Punctuation chord + descend to between-points.
  Game point: Layers 1+2+3+4. Maximum tension.
  Victory: Extended triumphant chord progression, celebration rhythm.
  Defeat: Descending progression, layers fade out.

  Stall count > 7: Add rhythmic pulsing that matches stall urgency.
  Close game (within 2 points, late): Layer 4 intensity rises.
  Blowout: Layer 4 drops out. Less dramatic.
```

**Genre / Vibe**
- Laid-back electronic / lo-fi beats
- Not aggressive or overwhelming
- Matches the Spirit of the Game vibe -- competitive but friendly
- Players should be able to play for hours without the music grating
- Think: what you'd actually hear from a bluetooth speaker at a tournament

## Spatial Audio

All game sounds are spatialized using the Web Audio API's spatial positioning:

```
For each sound emitter:
  - Position in 3D world space
  - Attenuation based on distance from camera/listener
  - Panning based on screen position
  - Doppler shift for moving emitters (disc in flight)

Listener position: camera position
Listener orientation: camera forward direction

This means:
  - Disc sounds move through the stereo field as the disc flies
  - Footsteps from distant players are quieter
  - Wind direction is audible
  - Crowd sounds come from the sidelines
```

## Technical Implementation

All audio is generated using the Web Audio API's built-in nodes:

```
Oscillators: OscillatorNode (sine, square, sawtooth, triangle)
Noise: AudioBuffer filled with random samples
Filtering: BiquadFilterNode (lowpass, highpass, bandpass)
Envelopes: GainNode with scheduled parameter changes
Effects: ConvolverNode (reverb), DelayNode (echo)
Spatial: PannerNode (3D positioning)
Mixing: GainNode tree for volume control per category

No external audio libraries. No sample loading. Pure Web Audio API.
```

### Audio Budget

```
Simultaneous voices target: 32
  - 1 wind ambient
  - 1 grass ambient
  - 1 crowd/environment ambient
  - 4 music layers
  - 14 player footstep channels (reused per player)
  - 3 disc sound channels
  - 5 UI/event sound channels
  - 3 spare

CPU budget: ~5% of frame time (target < 1ms at 60fps)
```

## Player Settings

```
Master Volume: 0-100
Music Volume: 0-100
SFX Volume: 0-100
Ambient Volume: 0-100
Commentary Volume: 0-100 (for future synthesized commentary)
Spatial Audio: On/Off (stereo fallback)
Stall Count Audio: On/Off (some players may find it stressful)
```
