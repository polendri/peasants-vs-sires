peasants-vs-sires
=================

A two-player JavaScript game pitting hordes of peasants against powerful sires – who will win?

![Peasants vs Sires in action](/screenshots/screenshot2.png)

## How to Play

You can play the game at [pshendry.github.io/peasants-vs-sires](http://pshendry.github.io/peasants-vs-sires).

### Goal

The aim of the game is to eliminate all of the opposing soldiers on the battlefield. Each player
has a timeline demonstrating how long until reinforcements arrive; when a reinforcement arrives,
you must decide whether to send them for help (queuing up TWO reinforcements), or to send them
to the battlefield to fight.

Reinforcements don't count towards preventing you from being eliminated, so make sure to keep
some soldiers on the battlefield! As an added complication, some soldiers are better fighters
than others, making them poor candidates for sending away for reinforcements.

### Controls

Player 1 (leader of the peasants): 'Q' to send for reinforcements, and 'W' to send to fight.

Player 2 (leader of the sires): 'O' to send for reinforcements, and 'P' to send to fight.

ESC will pause the game.

## Design Goals

Beyond simply re-learning some JavaScript, I had some specific things in mind when I came up with Peasants vs Sires:

* **Original content:** I wanted to do the entire game myself without any external assets, partly as a challenge and
  partly to ensure consistency. The code, the graphics, and the audio are essentially my own creations; a few very
  minor exceptions are listed in the Acknowledgements section.
* **Two-player:** I realized that in the absence of an AI opponent, this would severely limit the game's appeal if I
  tried to publicize it. I had no intention of doing so though, so I wanted this to be something that was fun to share
  with a real-life person beside you.
* **Minimalistic controls:** This was partly for the challenge, partly to restrict myself to ensure that I kept the
  concept small and achievable, and partly out of necessity to allow two players to play on one keyboard. I decided to
  limit myself to at most four keys per player, and in the end I went with two. I'm super pleased that some pretty fun
  gameplay (in my opinion) can emerge from such limited controls.
* **Contrast between silly and dark:** When it's presented in such a cute way, it's shamefully funny to watch
  waves of poorly-armed peasants charge fearlessly towards a fully-equipped knight. At the same time though, it's clear
  that the game is modelling a bloody peasant revolt, which isn't funny at all. I enjoyed combining the simplistic
  presentation (e.g. "X vs Y") and cute pixel graphics with what is ultimately a dark topic, and I hoped it might
  evoke some guilty laughs from the player.

## Limitations

I made sure to complete the game, but I did not have enough interest to extend it, so there are many ways it could be improved:

* An AI opponent would allow a single player mode, which would be great;
* The pause functionality could use improvement, in particular a visual indicator of pause state;
* There is no in-game tutorial, and while the controls and "reinforcements" concepts might be fairly obvious, the
  win condition definitely is not.

## Acknowledgements

I'd like to thank the following people and services that made making this thing easier:

* I arranged the main theme myself, but I did not compose it. It's an orchestral piece that I've heard both in a game
  mod and in a YouTube video, so it seems clear that it's public domain. I put it together from memory, since I can't
  find a source for it.
* [pulseboy.com](http://www.pulseboy.com/) for the very easy-to-use chiptunes composition tool.
* wolfgirl456 for [this](http://piq.codeus.net/picture/48159/m_n_) pixely font I used in a couple places.
