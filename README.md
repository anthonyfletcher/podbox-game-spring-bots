# Spring Bots

A puzzle game for the Arcade on an iPod running
[PodBox](https://github.com/anthonyfletcher/podbox).

A robot who hates flowers dreams they are out to get him, wakes, and sets
out across the islands to stomp every one flat. Walk into another robot and
a springy wire joins it on; the group then moves as one, and stops whole
when any of it would walk into the sea or a rock. Stomp every flower and
wire on every robot, and a bridge rises to the next island. A red grower
leaves a flower wherever it steps off; an orange bud turns into a grower
once it stomps a flower. 32 islands, then home to bed.

## Playing it

- **On the iPod:** download `springbots.pbg` from the latest
  [release](https://github.com/anthonyfletcher/podbox-game-spring-bound/releases),
  copy it anywhere onto the iPod, eject, and choose **Arcade** on the main
  menu.
- **In a browser:** <https://anthonyfletcher.github.io/podbox-game-spring-bound/>,
  with the keys or a phone's touch wheel.

Prev and Next step left and right, Menu up and Play down; the wheel steps
down (clockwise) or up. Select undoes a step. Any button skips the story.
**Choose level**, in the pause menu (hold Menu), goes to any of the 32
levels. Each level keeps your best time and fewest moves against its par.

## Changing it

The game is the `springbots` folder. Open it in the
[Arcade IDE](https://anthonyfletcher.github.io/podbox/ide/) in Chrome or
Edge with **Cart > Open folder**; it saves back into the folder. Every push
builds `springbots.pbg` (the **Actions** tab, under **Artifacts**) and puts
the web page up to date. Push a tag -- `git tag v2 && git push --tags` --
to attach the `.pbg` to a release of that name.

The levels are maps `level01` to `level32`. `tools/generator.py` makes
levels by search and checks each one has a solution, writing each map's
par (its shortest solution) as it goes:
`python tools/generator.py --level 12` prints one with its solution.

The [Arcade manual](https://github.com/anthonyfletcher/podbox/blob/master/arcade/manual/README.md)
covers the language and every function. With
[Claude Code](https://claude.com/claude-code), the Arcade skill in
`.claude/skills/podbox-arcade` is loaded when you ask for help with the
game.

## Credits

The mechanics are inspired by
[Dust Bunny](https://www.lexaloffle.com/bbs/?pid=166577) by
[Adam Atomic](https://adamatomic.itch.io/), a PICO-8 game. No code or
level design is taken from it: the code, art and levels here are new.

## Licence

This repository is under the 0BSD licence (`LICENSE`). The skill in
`.claude/skills` is text from the PodBox manual, under the GPL version 2.
