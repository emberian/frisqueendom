# Management Mode

## Overview

Management Mode is the strategic layer of FrisQueendom. You're not just a player -- you're building and running a team. Recruit players, design playbooks, manage a season, climb the ranks. This mode can be played extensively without touching the on-field gameplay, though the two integrate tightly.

Management Mode is inspired by Football Manager, but adapted for the unique culture and structure of ultimate frisbee -- a sport where Spirit of the Game matters, captains lead instead of coaches, and roster spots are earned through tryouts.

## Team Structure

### Roster

```
Active Roster: 20-27 players (regulation)
On-field: 7 per point
Substitutions: between points (unlimited)

Line Types:
  O-line: Offensive specialists (play when your team receives)
  D-line: Defensive specialists (play when your team pulls)
  Hybrid: Players who play both ways (versatile but tire faster)
```

### Roles

| Role | Description | Key Stats |
|------|-------------|-----------|
| **Handler** | Touches the disc the most. Initiates offense, resets, distributes. | Throw accuracy, throw variety, field vision, break throw |
| **Cutter** | Runs routes to get open. Catches the disc downfield. | Speed, acceleration, catching, jumping |
| **Deep Cutter** | Specializes in long runs. Goes deep for hucks. | Top speed, endurance, sky, contested catch |
| **Defensive Specialist** | Focuses on getting blocks and shutting down opponents. | Marking, positioning, block ability, speed |
| **Utility** | Jack of all trades. Can play any role competently. | All-around, composure, decision making |

### Captain System

Every team has 1-3 captains. Captains provide:
- Spirit bonus (team spirit = captain average spirit * 1.2)
- Leadership aura: nearby players perform slightly better
- Foul call authority: captains resolve contested calls
- Team morale influence: captain mood affects team morale

Captains are designated in management mode. Players with high composure and spirit make the best captains.

## Recruiting

### The Tryout System

New players are recruited through tryouts. This mirrors real ultimate club team formation:

```
Tryout Process:
1. Post a tryout announcement (costs some budget)
2. A pool of candidates appears (generated procedurally)
3. Candidates have partially-revealed stats (you can see some, not all)
4. Run tryout drills to reveal more stats:
   - Sprint drill: reveals speed, acceleration
   - Throwing drill: reveals throw power, accuracy
   - Cutting drill: reveals agility, endurance
   - Scrimmage: reveals decision making, field vision, composure
5. Select players to offer roster spots
6. Players may decline (they might prefer another team)
```

### Candidate Generation

```rust
struct RecruitCandidate {
    name: String,
    age: u8,            // 18-35
    experience: u8,     // years playing (0-15)
    potential: f32,     // hidden stat, 0-1 (how much they can improve)
    personality: Personality,
    known_stats: HashMap<Stat, f32>,    // revealed through drills
    hidden_stats: HashMap<Stat, f32>,   // not yet visible

    // Preference factors
    team_preference: f32,   // how much they want to join YOUR team
    other_offers: Vec<TeamRef>, // competing teams
    salary_expectation: f32,   // (in a team-budget context)
}
```

Candidate quality depends on:
- Your team's reputation (higher rep → better candidates)
- Your team's spirit score (high spirit → attracts spirit-oriented players)
- Region/division level (higher divisions → larger candidate pool)
- Time of year (most recruiting happens in the off-season)

### Scouting

You can scout other teams' players:
- Attend their games (see their stats in action)
- Scout reports (partial stat reveal, costs time)
- Some players are "available" (willing to switch teams)
- Poaching from other teams affects spirit reputation

### Player Development

Players improve over time through:

**Practice**
- Weekly practice sessions (you allocate practice focus)
- Focus areas: throwing, cutting, defense, conditioning
- Improvement rate depends on player potential and age
- Diminishing returns at high stat values

**Game Experience**
- Playing matches gives XP
- Certain in-game events give targeted XP:
  - Making a great throw → throw stat XP
  - Getting a block → defense stat XP
  - Layout catch → catching stat XP

**Mentoring**
- Pair a veteran with a young player
- Veteran's high stats "rub off" on the mentee
- Chemistry between mentor/mentee affects rate

**Age & Peak**
- Players peak at 24-28 (typically)
- Young players (18-22) improve quickly
- Peak players (24-28) improve slowly but are at their best
- Veterans (29-35) decline slowly in physical stats but mental stats hold
- Legends (rare): some players decline less or peak later

## Playbook Design

### Offensive Playbooks

You design the team's offensive strategy by selecting and customizing formations:

```
Formations available:
  Vertical Stack (default)
  Horizontal Stack
  Split Stack
  German Offense (structured isolation plays)
  Side Stack
  Custom (drag players to positions)

For each formation, you set:
  - Handler positions (how many, where)
  - Cutter lanes (where cutters operate)
  - Cutting priority (who initiates, who follows)
  - Reset timing (when to dump the disc back)
  - Deep look frequency (how often to huck)
  - Disc movement style (swing-heavy vs. up-the-line)
```

### Defensive Playbooks

```
Defenses available:
  Person (Man-to-Man)
  Force Forehand
  Force Backhand
  Force Straight-up
  Force Sideline / Force Middle

  Zone: 3-3-1
  Zone: 2-3-2
  Zone: 1-3-2-1 (Cup)
  Clam / Junk
  Custom

For each defense, you set:
  - Force direction (which side to force)
  - Switching rules (when to switch marks)
  - Poach aggression (how much to leave marks)
  - Zone tightness (how close together the zone plays)
  - Transition triggers (when to switch from zone to person or vice versa)
```

### Special Plays

Design specific plays for:
- **Pull plays**: What the offense does right after receiving a pull
- **Endzone plays**: Plays within 20m of the endzone
- **Sideline plays**: Plays when trapped on the sideline
- **After-turnover plays**: Quick strike plays after winning the disc back

These are selected from a playbook UI with X's and O's style diagramming.

## Season Structure

### Calendar

```
Off-season (Winter):
  - Tryouts and recruiting
  - Practice and training
  - Playbook design

Pre-season (Early Spring):
  - Tune-up tournaments
  - Line-setting (decide O-line and D-line rosters)
  - Scrimmages

Regular Season (Spring-Summer):
  - Regional tournaments (4-8 per season)
  - League play (if in a league)
  - Rankings accumulate

Post-season (Late Summer):
  - Sectionals → Regionals → Nationals
  - Single or double elimination brackets
  - Win Nationals = ultimate achievement (pun intended)
```

### Tournament Structure

Ultimate tournaments are typically weekend events:

```
Day 1 (Saturday):
  - Pool play: 3-5 games in round-robin pools
  - Each game to 15 or timed to 90 minutes
  - Pool results determine bracket seeding

Day 2 (Sunday):
  - Single elimination bracket
  - Championship game
  - Spirit awards

Between games:
  - Short rest periods
  - Substitute management (rest tired players)
  - Adjust playbook based on opponent scouting
  - Team morale events
```

### Rankings

Teams have a ranking score (like an ELO or USAU algorithm):
- Win against higher-ranked team: big ranking boost
- Win against lower-ranked team: small boost
- Lose to lower-ranked team: big drop
- Margin of victory matters slightly
- Recent results weighted more heavily

Rankings determine:
- Tournament seeding
- Division placement
- Recruiting appeal
- Media attention (in-game)

## Team Morale & Chemistry

### Morale

Team morale is a 0-100 value affecting performance:

| Morale | Effect |
|--------|--------|
| 90-100 | Flow state: +10% all stats, swagger animations more frequent |
| 70-89 | High: +5% all stats |
| 50-69 | Normal: no modifier |
| 30-49 | Low: -5% all stats, body language is sluggish |
| 0-29 | Crisis: -15% all stats, players may refuse to play |

Morale is affected by:
- Wins (+5 to +15)
- Losses (-5 to -15)
- Close games (win or lose, +2 -- competitive spirit)
- Blowout losses (-10)
- Good spirit (team or individual recognition) (+5)
- Bad spirit incidents (-10)
- Practice intensity (too much = burnout, too little = boredom)
- Captain speeches (triggered between games, +5 to +10)
- Team bonding events (+3 to +8)

### Chemistry

Players have chemistry with each other:

```
Chemistry is a pairwise value between players: -5 to +5

Positive chemistry:
  - Players who practice together
  - Players with complementary positions (handler + cutter)
  - Players with similar spirit values
  - Players who have made successful plays together in games

Negative chemistry:
  - Players competing for the same roster spot
  - Conflicting personalities (showboat vs team-first)
  - Foul disputes in practice
  - Very different spirit values

On-field effect:
  When throwing to a player with +3 or higher chemistry:
    - +10% catch rate
    - Better timing on cuts
    - Higher throw accuracy to that player

  When throwing to a player with -3 or lower chemistry:
    - -10% catch rate
    - Worse timing
    - Higher turnover chance
```

### Team Culture

Your management decisions create a team culture over time:

| Culture Trait | Built By | Effect |
|--------------|----------|--------|
| **Competitive** | Playing tough teams, hard practice | Better in close games, worse morale from losses |
| **Spirited** | High spirit, fair play | Better recruiting, spirit awards, less cheating |
| **Athletic** | Physical training focus | Higher physical stats but may neglect throwing |
| **Cerebral** | Playbook complexity, film study | Better AI decisions, more complex plays |
| **Clutch** | Winning close games | Composure bonus in critical moments |

## Budget & Resources

### Income
- Tournament entry fees cover basic costs
- Sponsorships (as team reputation grows)
- Fundraising events (team bonding + income)
- Merchandise (unlocked at higher reputation)

### Expenses
- Tournament registration
- Travel (higher-level tournaments may require travel)
- Equipment (discs, cones, jerseys)
- Practice field rental
- Tryout advertising
- Training camps

Budget management is intentionally lightweight -- ultimate is not a money sport. The emphasis is on people, not wallets.

## Management UI

### Roster Screen
- Player cards with stats, role, chemistry
- Drag-and-drop line assignment (O-line, D-line)
- Sort/filter by position, stat, age
- Player detail view: history, development trajectory, personality

### Playbook Screen
- X's and O's style field diagram
- Drag players into formation positions
- Draw cut routes with mouse
- Set priority and timing
- Test playbook against dummy defense
- Save/load playbooks

### Calendar Screen
- Season overview with tournaments and practice
- Click a tournament to see details, register, or skip
- Practice scheduling: drag practice types into weekly slots
- Rest days management

### Scouting Screen
- Upcoming opponent analysis
- Player-to-player matchup suggestions
- Opponent tendencies (favorite plays, weaknesses)
- Film study (replay highlights from previous games vs this opponent)

### Spirit Dashboard
- Team spirit history
- Individual spirit scores
- Awards received
- Incidents log
- Advice for improving spirit

## Integration with Play Mode

The management decisions directly affect the on-field gameplay:

- **Roster**: The players you select appear on the field with their specific stats
- **Playbook**: AI teammates execute the plays you designed
- **Chemistry**: Affects throw accuracy and catch rates between specific players
- **Morale**: Global stat modifier
- **Training focus**: Affects which stats are high/low
- **Spirit**: Affects foul calls and opponent behavior

You can play matches yourself (controlling a player) or simulate them (auto-play with AI). Simulated results are based on team stats, playbook quality, and some randomness.

### Auto-Play Simulation

For players who prefer management:
```
Match simulation resolves in ~5 seconds
Shows:
  - Score progression (point by point summary)
  - Key plays (highlights)
  - Stats (who scored, assists, blocks)
  - Spirit report
  - Injuries (if any)

You can intervene during simulation:
  - Call timeout → adjust playbook
  - Make substitutions
  - Switch from sim to play mode mid-game
```

## Saving

Management state saves to localStorage:
- Full roster with stats and development history
- Season calendar and results
- Playbook data
- Rankings
- Team culture and morale
- Budget

Save slots: 3 career slots + auto-save per career
