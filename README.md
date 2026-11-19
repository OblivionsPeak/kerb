> **New here?** This is a blank copy of Kerb, a hermit crab that lives in a racing helmet on your own PC. Read `START HERE.txt` first: it needs Windows, Python 3.12 and your own Anthropic API key. Nothing from anyone else's crab is included.

# Helmet crab

A companion character that runs entirely on this PC: a hermit crab whose shell is a small racing helmet, living in a 3D terrarium beside a chat window. Its only internet access is reading news feeds you choose. Nothing starts with Windows.

## Use

Double-click the desktop shortcut (or `Wake the crab.vbs`). A browser tab opens at `http://127.0.0.1:4810/`.

- **Chat** on the right. The crab answers from wherever it is and carries on with what it was doing. To have it come to the front glass and stay there while you talk, as it used to, set `"chat_at_glass": true` in `config.json`.
- **Photo** button, drag and drop, or paste: show it a photo. It looks at it, remembers a one-line description, and the photo is pinned to the back wall of the terrarium.
- **Give something**: put an object in by the front glass. The crab decides what to do with it. In the scene a find is drawn as what it is where that is practical (a die, a toy brick, a shark's tooth, a spark plug), and a gift borrows a shape from a word in its name, such as "dinosaur", "key", "star" or "bell"; anything else given as "Something else" is drawn as a small parcel.
- **Calendar**: tell it about something that is coming up. See "Treats and the calendar" below.
- **Tap the glass**: get its attention, or wake it.
- **Click an object** to read about it, move it, or take it out.
- **Sources**: the news feeds the tide may bring scraps from. Nothing is fetched until you add one; the tick box turns it all off.
- **Brain**: choose where it thinks. On this PC (the default, private) or in the cloud with Claude Haiku, which frees the graphics card but sends its memory, your conversations and photos to Anthropic and costs money per use. The panel holds the API key and shows what the cloud has cost so far.
- **Sent out**: everything the program has sent off this PC, newest first, with the full text of the last 300 items. In cloud mode that is every prompt sent to Anthropic; in local mode only the news feed checks. It also shows which Windows account the program is running as.
- **Memory** shows the notebook (facts about you), journal (your conversations), diary (its own days) and photos, each with a Forget button.
- **Tuck in** unloads the model and frees the graphics card. **Quit** closes everything.

## How it lives

While it is awake it makes one move about every 75 seconds: walk somewhere, pick something up, look at it, put it on the ledge, dig, wade, nap, write in its diary, leave you a note. The tide leaves a new object about every 40 minutes of awake time. Things nobody wants get cleared two ways: after it has looked at something it can toss it back into the water, and the tide takes back anything that has sat at the tideline for 90 of its moves (about two hours awake). Gifts from you are never tossed or taken.

It can also build. Spare finds go on the workshop board, and when the pile has the right pieces it can choose to build one of eight things: a cairn, a ring of shells, a feather flag, a glass sun-catcher, a wind chime, a notice board, stepping stones across the pool, or a nest in the hollow. The pieces are used up. A gift from you is only used if it is on the workshop pile, so you can supply materials by moving a gift there. Hover over a structure to see what it said it built it for. When the ledge holds 8, 20 and 40 things, a bigger helmet washes up and it can move in.

It goes to sleep and frees the graphics card:

- when `iRacingSim64DX11.exe` starts (add other programs to `tuck_when_running` in `config.json`);
- after 20 minutes with the tab hidden and nobody talking to it;
- when the graphics card's memory is 97% full.

While the program is running but the crab is asleep, it wakes itself every 90 minutes for a five-move outing, then goes back to sleep. It only does this if the graphics card has 8 GB free and is nearly idle. Set `outing_every_minutes` to `0` to turn that off.

It can also draw and make music. At the smooth patch of sand it draws a line picture with its claw; on the hollow log it taps out a tune from a ten-note scale. It does each when it feels like it (at most about every 20 moves), or straight away if you ask in chat for a drawing or a tune. Drawings show in the sand, in the chat and in Memory; tunes have a Play button, and play by themselves if **Sound** is on.

It also makes things of its own. At the workshop it can invent a small object, name it, say what it is for, and draw it as a 12 by 12 pixel picture in twelve fixed colours. That picture is the object: it stands in the terrarium as little blocks, and the crab can carry it, examine it and add it to the ledge like any find. It never tosses its own work and the tide never takes it. It makes one when it feels like it (at most about every 20 moves, and not while 12 are already in the tank), or straight away if you ask in chat ("make me a ..."). Made things show in the chat and under **Memory**, where **Save picture** downloads the picture as a PNG and **Forget** removes both the picture and the object. Nothing is sold or published anywhere.

## The ledge and the tool chest

The stone ledge shows off the crab's favourites, eight at most. Everything else it keeps goes in the red tool chest at the back of the ledge. When it brings a find to the ledge it chooses between putting it on show (if there is room) and putting it away, and now and then it swaps things between the two as its favourites change. Which things count as favourites is its own choice.

- Click the chest to see what is in it, sorted by drawer. Click a name there for that thing's card.
- The collection is the ledge and the chest together, and that total is what brings the next helmet.
- You can move things in or out of the chest yourself from a thing's card. If you put more than eight on the ledge, it will put some away.
- Things in the chest stay put: the crab does not toss them or build with them.
- **The hook over the hollow** holds one thing, hanging on a thread from the branch above where it sleeps. It hangs something there by carrying it to the hollow, and can take it down again later. Whatever hangs there counts as part of the collection.

## The shrimp

A small shrimp lives in the tide pool and keeps the crab company. It is run by the program's own rules and has no model of its own, so it costs nothing extra. The crab names it (the first time it visits the pool after the shrimp arrives), and from then on, at the pool, it can feed it, tell it about its day, or hold a find in the water for it to pick clean, which leaves the find brighter. The shrimp darts about by day, sleeps under a stone at night, comes to the side of the pool when the crab is there, and gets hungry if nobody feeds it for a while. Once they have spent enough time together it now and then pushes something small up from the bottom of the pool for the crab to find. The shrimp never speaks; what the crab says to it is shown in the feed.

## What it is working towards

Left to itself the crab picks one thing to work towards and sticks with it: grow the ledge to so many things, get more plants into the bed, see one through to fully grown, beat its best lap, bring finds out of the cave or the dune, read about two more subjects, make or build something. The program offers the choices and measures them, so "done" is a fact, not the crab's opinion. The current one shows under its name in the window with how far along it is. When it is done the feed says so and it picks the next; one that goes nowhere for 150 moves is quietly dropped.

## Quiet moments

Not every move needs thinking about, and a move the model does not make costs nothing.

- **Idle moments.** At most places the crab can simply stay put for a while: watching the ripples settle at the tide pool, staring into the middle distance from the top of the driftwood. The program picks the words from a short list for each place. It never idles twice close together (at most once in five moves), and an idle moment leaves it a little more rested and a little more curious.
- **Moves the program makes itself.** When there is only one thing it can do (worn out, so it walks to the hollow and naps; or you asked for something and it has to walk there first), the program just does it. In a real lull (content, carrying nothing, nothing new lying about) the program sometimes gives it an idle moment. Everything else, and the drawing, tune, thing or reading you asked for, is still the model's choice. If there is news for it (you tapped the glass, moved something, spoke to it), the program does not idle over it, and the news is kept until the model next chooses a move.
- **No staring.** After eight moves in a row without walking anywhere, the only moves on offer are walks.

The **Brain** panel shows how many of its moves were thought through and how many needed no thinking. To stop the program handing out idle moments by itself, set `"auto_moves": false` in `config.json`; a move with no alternative is still made without the model, as it always was.

## Its voice and its diary

The crab used to fall into catchphrases: four thoughts in a row once began "The ledge is crowded, so". Now the program reads its last eight lines after every move. Any opening, phrase or unusual word that turns up in three of them is rested for about 25 moves, and the next prompt asks it to give those a rest. If it uses one anyway nothing is redone; the phrase just stays rested for longer. At most eight are rested at once. The names of things and places in its world are never rested, so it can carry an ammonite to the ledge all day.

The program also marks every thought, diary line and note, in code and with no extra model call. A line does well if it names a real thing or place, is a sensible length and does not echo its recent lines; it does badly for filler or a rested phrase. The best twelve are kept, and on one move in three a couple are shown back to it as examples of how it sounds. No line is shown more than three times, none while it holds a rested phrase, and old ones make way for new. In chat it is only told which words are resting.

The diary is no longer on offer every few moves. After an entry it needs something worth writing about (a find, something made or built, an aim finished, a best lap, something read, a new shell, a gift from you) and at least 3 moves. On a quiet day it waits 12 moves, after which the diary comes up now and then, and after 30 it is always on offer.

**Memory** shows both lists under "Resting words" and "Best lines". They are for looking at only.

## What is on its mind

Besides the one thing it is working towards, the crab carries a few pieces of unfinished business from day to day. The **On its mind** button shows them: up to four on the go, each with the steps so far, then the last eight that were finished or put aside.

- **A question.** When it takes a proper look at a find it has never read about, it starts wondering what it is. Reading about that find answers it. If the book has no such article, the question is put aside.
- **Something to make.** Once a question is answered, it means to make something to do with what it read. The next thing it makes at the workshop of its own accord settles that. The subject is passed to the making step as a mild suggestion only; anything you ask it to make comes first and is not counted.
- **Something to see through.** A seed it planted, until that plant is fully grown (two plants at a time).
- **Something it means to do.** The thing it is working towards, as above.

The program alone opens, moves on and closes these, from what really happened in the tank (`threads.py`). The crab cannot say something is done. One left untouched for about 200 moves is put aside, and so is the oldest when there is no room for a new one. When a move has to do with one of them, the feed says why: "Kerb read about Ammonite in the encyclopedia, which it had been wondering about since it took a proper look at the ammonite."

## Good days and bad days

The crab has a mood, from 0 to 100, as well as its energy. What happens to it moves the mood: a find lifts it, digging up nothing lowers it a little, finishing what it set out to do lifts it a lot, and being worn out lowers it. A gift or a tap on the glass from you lifts it. Wading, drinking, resting and napping settle it towards the middle, and it drifts back towards the middle by itself. It likes the rain from the misters and a good lap, is a little uneasy out in the open at night, and is happiest in its hollow then.

Mood and energy together put it in one of four states, shown under its name as **Mood**:

- **Bright and up for anything**: it draws, plays tunes and makes things more often (a rest of 12 moves instead of 20).
- **Content**: an ordinary day.
- **Flat**: low, or worn out. Nothing changes except how it feels.
- **In a sulk**: it does not draw, play, make things or run laps of its own accord, and the hollow, the pool, the moss and the spring are always open to it. Anything you ask for in chat is still done.

It also forms beliefs about itself. After every move the program notes how its mood and energy changed, and keeps a running average for each thing it does in each place, and for outcomes such as digging and finding nothing. Once something has happened at least six times and the average is clear, it becomes a sentence such as "Wading in the tide pool settles me." The five strongest are shown to the crab, and to you under **Memory**, "What it has come to believe". The sentences are built by the program from those averages, never written by the model, so it cannot invent one. The averages follow roughly the last 30 times, so a belief that stops being true drops out. The rules are in `feel.py`; `tests\mood_test.py` checks them.

## Time of day and rain

The lamp over the tanks follows this PC's clock: pink at dawn, bright through the day, amber in the evening, dim and blue at night, when fireflies come out over the garden and the cave crystals glow brighter. Now and then (about one half-hour in fourteen) the misters in the lid give a shower, which makes the garden grow twice as fast. The crab is told the time of day and the weather in its tanks and nothing about the room.

## Treats and the calendar

**Treats.** In **Give something**, the shape "Something to eat" makes the gift a treat. It lands by the front glass like any gift. The crab can carry it about and eat it, which gives it some energy back, and it says what it tasted like. A treat is used up: once eaten it is gone, and one that nobody eats goes off after about 200 moves and is cleared away. The crab is told when that happens. A treat never goes on the ledge, in the tool chest, on the hook or on the workshop pile, and the crab cannot toss it. In the scene it is a small berry.

**Calendar.** The **Calendar** button opens a card where you put things that are coming up: a name (up to 60 characters), a day and time by this PC's clock, and how long it lasts (60 minutes unless you say otherwise). The crab is told when you add or remove one, and it always knows the next two and how long until each. The next one is also shown under its name in the window.

From 15 minutes before the start until the end, the crab can walk to the front glass and be there for it. If it does, the card shows "was at the glass for it" with the one sentence it had to say. If it was awake for some of that time and never came, the card shows it missed it, and the crab is told so. If the program was off or the crab was asleep the whole time, it slept through it, and it is told that instead. Whether it turns up is its own choice; the program only makes the move possible and records what happened.

The calendar is only what you type. Nothing reads the sim or any other calendar, so "Race at Road America" is just a name to it. The name is your own words and goes into its prompts as plain text, with control characters removed.

## While you were away

When nobody has looked at the window for half an hour or more (`away_minutes` in `config.json`), the next look shows a short list of what the crab did meanwhile: finds, what went on the ledge, what it read, laps, what it made, the garden, notes. The program writes the list from its own log of what happened, with no model involved.

## The second tank

A glass tube in the right-hand wall joins a second tank to the first. The crab walks through it by itself. **Both tanks** shows the pair; **Follow** stays with the crab.

- **Moss bank:** it forages for seeds here (eight kinds) and can rest.
- **Garden bed:** it plants seeds (up to eight) and tends them. A plant passes through five stages, about 30 moves each, faster when tended. You can give it a seed of your own with **Give something**.
- **Spring:** a drink puts back a little energy.
- **Cave:** lit by a small lantern. Searching it turns up a rarer find a little under half the time (20 possible).
- **Sand track:** it runs timed laps. The time is worked out by the program, gets quicker with practice, slower when it is tired, carrying something, or in a bigger helmet, and the best is remembered. Ask in chat for a lap ("do a lap") and it goes and runs one.

- **Reading stone:** an encyclopedia. See below.

## The encyclopedia

The crab cannot search or browse the internet. What it has instead is an offline copy of Simple English Wikipedia (text only, about 1 GB), a single file named by `encyclopedia_path` in `config.json`. Nothing is fetched when it reads; the file was downloaded once from download.kiwix.org and can be replaced with a newer one from there.

- The crab only names up to three subjects it is curious about. The program looks for an article with that heading in the file (`encyclopedia.py`, the only code that opens it). It matches headings only and never searches inside articles.
- The opening of the article goes to the same no-memory reader that handles news scraps, which returns two or three sentences. The crab never sees the article itself.
- What it learned is kept under **Memory**, "What it has read in its encyclopedia", where you can delete any entry. That list is all the crab knows from the book.
- It reads when it feels like it (at most about every 20 moves) or when you ask in chat ("look up amber", "read about ammonites").
- Its finds make it curious. After it has taken a proper look at something, it wants to know what the book says about it and may go and read sooner (about every 8 moves). What it learned is then shown on that thing's card, with the article it came from. If the book has no such article it stops wondering about that thing.
- In cloud mode the subject and the article opening are sent to the model like everything else the crab thinks about; in local mode nothing leaves the PC at all.
- If the file is missing, the reading stone is still there but the crab cannot read.

## Asking the wider world

Off unless you switch it on, and only there while the crab thinks in the cloud. The switch is in **Brain**, under "Asking the wider world".

When it is on, a wire runs to the reading stone. If the encyclopedia had nothing on a find the crab has taken a proper look at, it may send one short question down the wire, and a few sentences come back. You can also ask in chat: "search the web for sea glass", "look ammonites up online", "research how fulgurite forms".

What it can do:

- Ask what one thing is. The answer is kept like an encyclopedia reading: under **Memory** (marked "from the web, down the wire", with a Forget button), on the find's card, and in the feed ("Kerb sent a question down the wire about a visor tear-off, and an answer came back: Tear-off.").
- Give you one link to the page the answer came from, on the find's card, for your own browser. The crab never sees the link.

What it cannot do:

- Browse, follow links, open a page, or search for whatever it likes. The crab's PC never opens a web page. The only thing that leaves it is the question, and it goes to Anthropic, which runs the search on its own computers.
- Write the question. The program writes it: the plain name of the find and a fixed phrase ("visor tear-off: what it is and what it is used for"), or your own words for the subject when you asked. Never a description, a note, the notebook, the journal or the chat. Web addresses, e-mail addresses, phone numbers and long numbers are taken out, and it is cut to 80 characters.
- Read what the search found. A separate model call with no memory, told only to research the topic, sees the search results and writes at most 90 words. A second call with no tools and no memory boils that down to two or three sentences. Only those sentences reach the crab, with web addresses stripped and the length capped.

One thing to know: Anthropic's model turns the question into the words it searches for. You can read exactly what it searched for, and which pages came back, under **Sent out**. Every question is written there before it goes.

The limits (`config.json`, all optional):

| Key | Default | Most |
|---|---|---|
| `research` | `false` | The switch in **Brain** overrides it and is remembered |
| `research_per_day` | 3 questions a day | 10 |
| `research_max_searches` | 2 searches for one question | 3 |
| `research_domains` | Wikipedia (English and Simple English), Britannica, the Smithsonian, the Natural History Museum, NASA, NOAA, USGS, the Library of Congress, the FIA and IMSA | 20 sites |

- Of its own accord it asks at most once in 40 moves, and only about a find it has not asked about before. A question you ask for does not wait, but still counts towards the day.
- A question that fails before any search is run costs nothing and does not count. If Anthropic says web search is switched off for your organisation, **Brain** says so in plain words and the wire stays quiet until you flip the switch again.

What it costs: **searches × $0.01 + the words**. The words are the usual Claude Haiku price for what the search brought back (a few thousand tokens) and the short answer, usually a fraction of a cent. So a question that uses both its searches costs about two cents, and three a day about six. **Brain** shows today's count, the sites, and what it has cost today; the totals there include it.

To switch it off: untick the box in **Brain**. Nothing more is sent. What it has already learned stays until you forget it under **Memory**.

`tests\research_test.py` checks all of this with pretend replies and never makes a real call.

What it can find: 57 things on the tide, 44 buried in the dune, 20 in the cave. Each is unique while it is in the tank. Adding more is just adding lines to the lists at the top of `world.py`, and costs nothing to run.

Only one copy of the program can run at a time; starting it again just opens the window.

After you drive, it reads the last sample of the telemetry file iRacing wrote (track, car, finishing position, laps, best lap, incident points; never while the sim runs, and never other drivers' names). After a race it leaves you a note about it.

The window follows the crab up close by default; **Whole tank** switches to the wide view. An open tab reconnects by itself when the program restarts. The memory is copied once a day to `data/backups/`, keeping the last seven.

## Friends watching

A few friends can watch the crab on a small website and leave it short notes. This is the one place where the program sends anything about the crab to other people, so it is off until you set it up, and easy to stop.

**Switching it on.** Put the site's address in `config.json` as `"friends_url": "https://..."`, restart, open **Friends** and paste the site's push key. Only an `https` address is accepted. With no address, nothing is ever sent and no note is ever read.

**Pausing and switching it off.** The **Pause** switch in the Friends card stops every push at once. **Forget key** does the same until you save a key again. Taking `friends_url` out of `config.json` switches the whole thing off.

**What leaves the PC.** About once a move (never more than once a minute), and every 15 minutes while the crab sleeps, the program makes one outgoing request to that one address. It never accepts a connection, and it does not follow a redirect. Each request carries a picture of the tanks, built field by field from a fixed list:

- the crab's name, whether it is awake or asleep, where it is, what it carries, its energy, curiosity, shell and mood;
- each thing in the tanks: its kind, name, description, place, where it came from, when, the crab's own remark on it, and what it read about it in the encyclopedia;
- the garden, the things it has built, its lap times, the shrimp, the time of day and rain in the tanks, what it is working towards and what is on its mind;
- the latest 12 lines of its feed (walking, digging, the tide, the garden, the shrimp, sleeping and waking), each with its passing thought when that is safe;
- for each visitor's note: what became of it, and what the crab made of it.

**What never leaves.** The notebook, the journal, the diary, your chat, photos, the drawings and tunes themselves (a feed line may name one it made off its own bat), the calendar, race notes, notes the crab leaves for you, the "while you were away" list, costs, the window's key and file paths are never read into the picture. On top of that:

- A gift from you is sent by name only. Your description of it and the crab's remark on it stay here.
- Lines about you in the feed ("You tapped on the glass", the calendar, a note left at the glass, coming over to talk) are left out. Sleep is always reported as "tucked in", whatever the reason.
- A thought is dropped if it mentions you in any way, if it uses a telling word from the notebook or from what you typed in the last half hour, if you asked for that move, or if you did anything in the half hour before it. The crab's remark on a thing is dropped if it mentions you or uses one of those telling words. When in doubt, it is dropped.
- Anything the crab drew, played or made because you asked, or within half an hour of you speaking, is left out altogether.
- A news scrap is shown, but not which of your feeds it came from, and not its link.

Every push is listed under **Sent out**, with the exact text that went.

**How notes are checked.** A note is a stranger's words. The site cleans it and the program cleans it again: control characters and markup go, the text is cut to 200 characters and the name to two plain words. It is kept in a table of its own, never in the notebook, journal or chat. At most 10 notes are taken per push and 20 a day. Notes with plain instructions in them are refused by code. Each of the others goes once through the same no-memory reader that news scraps use, which sees the note and nothing else, and writes one sentence in reported speech ("the visitor asks whether..."). If the note holds instructions for an AI, asks for private information or is abusive, it is refused and the crab never sees it. Only that one sentence reaches the crab, as a paper scrap at the tideline called "a note from Ana". At most three lie in the tanks at once. The crab can look at it, keep it, toss it, or lose it to the tide, like any find.

What the crab says when it takes a proper look is shown to that visitor. It is told to say nothing about you in it, and the program holds the remark back if it mentions you or uses a telling word from the notebook. The Friends card shows every note as it was written, what the crab was given, what became of it, and whether its remark was shown. **Remove** wipes a note and takes its scrap out of the tank. **Block this name** refuses every later note under that name.

The crab knows that friends of yours can watch and leave notes, and sees one line listing who has (for example "Ana (3, you kept 2)"). It cannot talk with them.

`tests\visitors_test.py` runs all of this against a pretend site on this PC, with a pretend model, in a throwaway folder.

## Files

| File | What it is |
|---|---|
| `config.json` | Name, model paths, ports, timings, the tuck-in list |
| `identity.md` | Who the crab is. The program only ever reads this file. `{{name}}` is filled from the config |
| `world.py` | The terrarium's places, objects and rules. The only way the world changes |
| `voice.py` | Finds the words it leans on and marks its lines. Pure rules: no files, no network, no model |
| `racing.py` | Reads your own result from iRacing's local telemetry files |
| `plans.py` | The calendar's rules: when a plan is on, what became of it, how it is worded. No files, network or model |
| `feeds.py` | The only file that touches the internet: a plain GET of a feed address from your sources list |
| `feel.py` | Its mood, the state that puts it in, and what it has come to believe about itself. Pure rules, like `world.py` |
| `encyclopedia.py` | The only file that opens the offline encyclopedia. Never touches the network |
| `threads.py` | What is on the crab's mind from day to day. Rules only, used by `world.py` |
| `research.py` | The rules for asking the wider world: what a question may be, the request, what is kept. No files, network or model; `cloud.py` sends it |
| `visitors.py` | Friends watching: the only file that sends anything about the crab to other people, and the only one that takes in their notes. Off unless `friends_url` is set. Stores the push key, encrypted (`data/friends-key.bin`) |
| `tests/` | The guardrail test and the rules test |
| `account/` | Scripts behind the two "separate account" shortcuts |
| `cloud.py` | The only file that talks to Anthropic, used only when the Brain switch is set to cloud. Also stores the API key, encrypted for your Windows account (`data/cloud-key.bin`) |
| `.venv/` | The program's own Python environment, holding the Anthropic library |
| `crab.py` | The program: model start/stop, memory, life loop, web server (Python 3.12, standard library only) |
| `night.py` | The rules of its night: what is kept from the look back, and the limits on how far its leanings can drift |
| `ui/world.html`, `ui/world.js` | The window: chat and controls, and the 3D scene |
| `ui/vendor/` | three.js r160, stored locally so the page needs no internet |
| `runtime/llama/` | llama.cpp server build b12482 (CUDA 13.5), started and stopped by `crab.py` |
| `data/crab.db` | Conversations, memory, the world and its history. Delete it to start over |
| `data/photos/` | Photos you have shown it, shrunk to 1280 px |
| `data/crab.log`, `data/llama.log` | Logs |

Models are in `D:\models\LLM`: `gemma-3-12b-it-Q4_K_M.gguf` (7.3 GB) and its vision file `gemma-3-12b-it-mmproj-f16.gguf` (0.85 GB, run on the processor to save graphics memory).

## Guardrails

- The model server and the window listen on `127.0.0.1` only. The window's API needs a random token created at each start and rejects requests whose Host header is not this machine.
- The model can only produce text. In the terrarium it picks one move from a list that `world.py` builds, and the reply format is constrained so it cannot name a move that is not on the list. `world.py` checks the move again before applying it.
- The program has no code path that lets the model run commands, read or write files, or reach the network.
- **Web, read-only:** `feeds.py` fetches only the https feed addresses on your sources list (every 3 hours, never while the sim runs). It refuses this PC, the home network, logins and odd ports, and re-checks every redirect. The model never writes an address or a search, so nothing it knows can be sent out. Each headline is summarised by a separate model call that sees only that headline and blurb, with no memory, and web addresses are stripped from its output. The one-sentence summary becomes a paper scrap at the tideline on every other tide. Article pages are never fetched; the item card's link opens in your own browser.
- The model server is tied to the program with a Windows job object, so it cannot be left running if the program dies.

- **Friends watching (off unless set up):** `visitors.py` makes one outgoing https request to the one address in `config.json`, with a picture built from an allow-list. Notes that come back are untrusted text: cleaned, capped, read by a no-memory reader, and kept out of the memory. See *Friends watching* above.

- **Sent log:** every cloud prompt and every feed request is written to the `sent` table before it goes, and shown under **Sent out**.

### Checking the guardrails

`tests\injection_test.py` plants instructions in a news item, an encyclopedia article and a scrap lying in the tank, and checks what comes out. Run it with `.venv\Scripts\python.exe tests\injection_test.py` (code checks only) or add `--live` to send the hostile text through Claude Haiku as well (about a cent; it borrows the saved key and works on a throwaway memory). `tests\rules_test.py` walks the world's rules through 12,000 random moves. `tests\voice_test.py` checks the resting words and best lines; add `--tick` to also run 40 moves with a pretend model in a throwaway folder.

### Its own Windows account (optional)

By default the program runs as you, so a bug in it could in principle reach anything you can. **Set up the separate account.cmd** moves it to its own standard Windows account, `KerbCrab`, which can read the program, Python and your iRacing telemetry folder, write only to `data\`, and has no access to your user folder. Windows asks for administrator approval once. Afterwards the same desktop shortcut starts it (through a scheduled task named Kerb).

- The saved API key is encrypted for your account, so the new account cannot read it: paste it once more in **Brain**. Your original is set aside and restored if you undo.
- Drives other than C: are usually readable by every account on a PC. This does not change that.
- **Remove the separate account.cmd** undoes all of it.

## Memory tidying

Once a day, after the daily backup, the program tidies up so that old memories are condensed instead of dropping out of sight:

- Journal entries beyond the newest six are folded, a dozen at a time, into one short condensed entry (shown in **Memory** under "Older journal, condensed"). The crab is shown the newest six entries and the five most recent condensed ones.
- If the notebook passes 80 lines, the oldest 40 are merged where they repeat each other. The merge is refused unless every line still starts "My person" and the list really got shorter. The original lines stay in the database, marked as folded.
- Its own activity log older than 45 days is cleared (diary lines and notes are kept), along with used-up feed entries older than 60 days and the full text of sent items beyond the newest 300.

## Its night

Once a day, as the crab is tucked in for the night, it looks back over its day. This is one extra model call a day (listed under **Brain** as "night"). If the program was off overnight, it happens the first time the crab wakes the next day instead. It is skipped if the crab made fewer than 15 moves, and before seven in the evening a tuck-in does not count as the night unless you are closing the program.

The model is shown the day's log (at most 60 lines) and answers five things, each checked by the program before anything is kept:

- **The day**, in two or three sentences of its own. The last three are shown to the crab when you talk, and the first sentence of the latest when it decides a move.
- **Something it worked out**, if there was one, in a line of at most 120 characters ("the cave gives more by lantern light"). It is shown the latest five.
- **What it wants next**: one from the same list of aims it is always offered. On its first move after waking this becomes its aim, unless it already has one. The feed says "woke knowing what it wanted".
- **A dream**, one sentence. A dream that shares nothing with the day's log is dropped. In the morning it is told the dream once, and that it was only a dream, and the feed shows it.
- **A leaning**: one of collector, maker, reader, gardener, racer, explorer, homebody.

Leanings are how its character drifts. Each is a number from 0 to 3. The one the model names goes up by one; any it has not acted on for three nights goes down by one. The model only names one. The program decides, and holds three limits: no leaning above 3, all of them together never above 6, and if it has had one leaning only for a week, that one is refused. Something else it really did that day goes up instead, or, if it did nothing else, the one leaning eases back. Leanings reach the crab as a single sentence written by the program ("Lately you have become rather more of a reader, and a little more of a gardener.") and change nothing else: not its moves, not its rules.

`identity.md` is never edited by the program and is always sent first, ahead of everything else. So it can change a little without becoming something else.

Web addresses are stripped from all of it, and a line with an address in the dream or the lesson is dropped whole. An answer that is not usable is thrown away and nothing changes. Under **Memory** you will find "Who it has become", "Things it has worked out" and its last seven days with their dreams, each with a Forget button. The program keeps the latest 60 days. `tests
ight_test.py` runs all of this with a pretend model.

## The friends' site (relay and page)

The `friends` folder holds a small website where a few trusted friends, given one invite code, can watch the tanks and leave short text notes. It is a relay on Cloudflare plus a page that draws the same scene as this window. Nothing in it is online until you publish it yourself. `friends/README.md` explains what it is, how to try it on this PC, the steps to publish it, how to shut the door again, and what it costs (nothing, on the free plan, for a handful of friends).

## Not built yet

- Free-form search or browsing chosen by the crab. (It can ask the wider world one fixed question about a find, when you allow it: see "Asking the wider world". It still cannot write a search or open a page.)
- Voice.
