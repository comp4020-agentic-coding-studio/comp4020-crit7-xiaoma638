# Process overview

## What I built

I built an ANU computing degree planner. Students can add courses to semesters, keep their plan after a reload, and see which requirements are met or still missing. The README explains the rule model and the limits of the prototype.

## How I got here

I chose to support all seven computing degrees instead of starting with one, as the agent had suggested. That made a data-driven rule engine necessary: adding a degree means adding rule data rather than page logic, and tests can check every degree the same way. Research then exposed harder cases, including capped lists, repeatable courses and nested specialisations, which the engine had to model ([`dfb4394`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-xiaoma638/commit/dfb4394), [`7bba2a7`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-xiaoma638/commit/7bba2a7)).

The rules are grounded in the 2027 ANU Programs and Courses pages. Each rule file records its source, seed tests check that each degree's rules add up to its published total, and nothing was invented: a specialisation whose 2027 page returns 404 was left out and noted ([`7bba2a7`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-xiaoma638/commit/7bba2a7)).

Passing tests did not mean the product was correct. Using the planner, I found that an upper limit showed "MET" with no courses planned, and that a 2021 plan was checked against 2027 rules. My prompt (translated from Chinese): "Mathematically correct, but a user will think they have completed a graduation requirement." Each fix came with a regression test for the case I found ([`2b5503a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-xiaoma638/commit/2b5503a)). Later checks found MMLCV filed as undergraduate and repeated courses counting twice; both were fixed at the cause and tested ([`8c93886`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-xiaoma638/commit/8c93886), [`38b7e32`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-xiaoma638/commit/38b7e32)).

I then stopped expanding scope, with no offering data, accounts or extra degrees, and asked for explicit search results, next steps, moving courses and feedback with undo instead ([`4073e5e...74fc92b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-xiaoma638/compare/4073e5e...74fc92b)). I had the agent verify each change with HTTP spec tests, headless-browser runs at 1400px and 390px, and the deployed Fly app, and I reviewed the screenshots myself.
