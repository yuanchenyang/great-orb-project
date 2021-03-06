﻿// GOP Engine tests

function gopTestSinglePlayer(
    description: string,
    playerLocation: Point,
    orbs: Point[],
    altar: Altar,
    actionsStr: string,
    expectedPlayerLocations: Point[],
    expectedOrbFinalLocations: Point[],
    expectedScore: number) {
    QUnit.test(description, assert => {
        let gs = new GameState(new GopBoard(53, 53), [playerLocation], orbs, orbs.length);
        let player = gs.players[0];
        gs.reset(altar);

        let actions = GameActionList.parse(actionsStr).getForPlayer(0);
        actions.forEach((action, i) => {
            player.action = action;
            gs.step();
            if (expectedPlayerLocations !== undefined) {
                assert.equal(player.location.toString(), expectedPlayerLocations[i].toString(), "Player location at tick " + (i + 1) + " should match");
            }
        });

        if (expectedOrbFinalLocations !== undefined) {
            gs.orbs.forEach((orb, i) => {
                if (expectedOrbFinalLocations[i] !== undefined) {
                    assert.equal(orb.location.toString(), expectedOrbFinalLocations[i].toString(), "Orb " + (i + 1) + " final location should match");
                }
            });
        }

        if (expectedScore !== undefined) {
            assert.equal(gs.score, expectedScore, "Score should match");
        }
    });
}

Utils.loadAltars(1, 6).always(() => {

    gopTestSinglePlayer("Simple scoring: 1-away", new Point(2, 0), [new Point(2, -4)], Altar.Air, "*A----",
        [
            new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0),
            new Point(2, 0), new Point(2, 0)
        ],
        [], 1
    );

    QUnit.test("Glitchrepel scoring: pillar #3", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(-2, 0)], [new Point(1, -7)], 1, 0, Altar.Air);
        let player = gs.players[0];
        let orb = gs.orbs[0];

        player.action = GameAction.move(new Point(-2, 2));
        gs.step();
        assert.equal(orb.location.toString(), "(1,-7)");
        assert.equal(player.location.toString(), "(-2,2)");

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(1,-7)");
        assert.equal(player.location.toString(), "(-2,2)");

        player.action = GameAction.attract(0, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(1,-7)");
        assert.equal(player.location.toString(), "(-2,0)");

        player.action = GameAction.attract(0, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(1,-6)");
        assert.equal(player.location.toString(), "(-2,0)");

        player.action = GameAction.idle();
        gs.step();
        assert.equal(orb.location.toString(), "(0,-5)");
        assert.equal(player.location.toString(), "(-2,0)");
        player.action = GameAction.attract(0, false, false, true);

        for (let i = 0; i < 4; i++) {
            gs.step();
        }
        assert.equal(gs.score, 0);
        gs.step();
        assert.equal(gs.score, 1);
    });

    QUnit.test("Glitchrepel scoring: 5-away", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(0, -2)], [new Point(2, 8)], 1, 0, Altar.Air);
        let player = gs.players[0];
        let orb = gs.orbs[0];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(2,8)");
        assert.equal(player.location.toString(), "(2,-2)");

        player.action = GameAction.attract(0, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(2,8)");
        assert.equal(player.location.toString(), "(2,0)");

        player.action = GameAction.attract(0, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(2,7)");
        assert.equal(player.location.toString(), "(2,0)");

        player.action = GameAction.attract(0, false, false);
        for (let i = 0; i < 6; i++) {
            gs.step();
        }
        assert.equal(gs.score, 0);
        gs.step();
        assert.equal(gs.score, 1);
    });

    QUnit.test("Orbdrag: portal", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(1, 2)], [new Point(-5, -8)], 1, 0, Altar.Air);
        let player = gs.players[0];
        let orb = gs.orbs[0];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        gs.step();
        assert.equal(orb.location.toString(), "(-4,-7)");
        assert.equal(player.location.toString(), "(2,1)");
    });

    QUnit.test("Mind scoring trick at (-13,-5)", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(-13, -5)], [new Point(-6, 1)], 1, 0, Altar.Mind);
        let player = gs.players[0];
        player.repel = true;

        player.action = GameAction.attract(0, false, false, true);
        for (let i = 0; i < 6; i++) {
            gs.step();
        }
        assert.equal(gs.score, 0);
        gs.step();
        assert.equal(gs.score, 1);
    });

    QUnit.test("Repel while orb is moving to an out-of-reach position should not attract", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(-11, -5)], [new Point(-6, 0)], 1, 0, Altar.Mind);
        let player = gs.players[0];
        player.repel = true;
        let orb = gs.orbs[0];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        player.action = GameAction.move(new Point(-13, -5));
        gs.step();
        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        gs.step();
        assert.equal(orb.location.toString(), "(-4,2)");
        assert.equal(player.location.toString(), "(-11,-4)");

        player.action = GameAction.idle();
        gs.step();
        assert.notEqual(orb.location.toString(), "(-5,2)");
        assert.equal(player.location.toString(), "(-11,-4)");
    });

    QUnit.test("Prototick for orb should not extend to second orb", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(0, 2)], [new Point(-5, -1), new Point(-8, 2)], 2, 0, Altar.Air);
        let player = gs.players[0];
        let orbB = gs.orbs[1];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        player.action = GameAction.attract(1, false, false, true);
        gs.step();
        gs.step();
        // Orb B should not have moved
        assert.equal(orbB.location.toString(), "(-8,2)");
    });

    QUnit.test("Non-glitch repel should not move player", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(3, -1)], [new Point(-1, 5)], 1, 0, Altar.Air);
        let player = gs.players[0];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        player.action = GameAction.attract(0, false, true, true);
        gs.step();
        assert.equal(player.location.toString(), "(3,1)");
    });

    QUnit.test("Weird portal angle on air using prototick-force-attract", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(2, -2)], [new Point(-3, -7)], 1, 0, Altar.Air);
        let player = gs.players[0];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        player.action = GameAction.move(new Point(2, 0));
        gs.step();

        player.action = GameAction.attract(0, true, false, true);
        gs.step();
        assert.equal(player.run, false);
        assert.equal(player.location.toString(), "(2,0)");

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        assert.equal(player.run, false);
        assert.equal(player.location.toString(), "(2,-1)");

        player.action = GameAction.idle();
        gs.step();
        player.action = GameAction.attract(0, false, false, true);
        for (let i = 0; i < 5; i++) {
            gs.step();
        }
        assert.equal(player.location.toString(), "(2,-1)");
        assert.equal(gs.score, 1);
    });

    QUnit.test("Glitchrepel should attract from old position", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(1, -2)], [new Point(6, 9)], 1, 0, Altar.Fire);
        let player = gs.players[0];
        let orb = gs.orbs[0];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        player.action = GameAction.attract(0, false, true);
        gs.step();
        assert.equal(player.location.toString(), "(2,1)");
        assert.equal(orb.location.toString(), "(6,9)");
        gs.step();
        assert.equal(player.location.toString(), "(2,1)");
        assert.equal(orb.location.toString(), "(6,8)");
    });

    QUnit.test("Swapping wands during pillar #5", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(2, 2)], [new Point(-1, -9)], 1, 0, Altar.Air);
        let player = gs.players[0];
        player.run = false;
        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        gs.step();
        player.action = GameAction.attract(0, false, true);
        gs.step();
        gs.step();
        player.action = GameAction.attract(0, false, false);
        for (let i = 0; i < 7; i++) {
            gs.step();
        }
        assert.equal(player.location.toString(), "(2,0)");
        assert.equal(gs.score, 1);
    });

    QUnit.test("Prototick from another orb does not activate glitchrepel", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(-2, 2)], [new Point(4, -4), new Point(1, -7)], 2, 0, Altar.Air);
        let player = gs.players[0];
        let orbB = gs.orbs[1];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        player.action = GameAction.attract(1, false, false, true);
        gs.step();
        player.action = GameAction.attract(1, false, true, true);
        gs.step();
        player.action = GameAction.idle();
        gs.step();
        assert.equal(player.location.toString(), "(-2,0)", "Player should be at (-2,0)");
        assert.equal(orbB.location.toString(), "(1,-7)", "Orb B should not have moved");
    });

    QUnit.test("Glitchrepel repelling: 4-away", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(0, -2)], [new Point(2, 7)], 1, 0, Altar.Air);
        let player = gs.players[0];
        let orb = gs.orbs[0];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(2,7)");
        assert.equal(player.location.toString(), "(2,-2)");

        player.action = GameAction.attract(0, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(2,7)");
        assert.equal(player.location.toString(), "(2,0)");

        player.action = GameAction.attract(0, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(2,8)", "Orb should be repelled");
        assert.equal(player.location.toString(), "(2,0)");
    });

    QUnit.test("Prototick when orb moves within reach", assert => {
        let gs = new GameState(new GopBoard(53, 53), [new Point(2, -2)], [new Point(-2, -6)], 1, 0, Altar.Air);
        let player = gs.players[0];
        let orb = gs.orbs[0];

        player.action = GameAction.attract(0, false, false, true);
        gs.step();
        assert.equal(orb.location.toString(), "(-2,-6)");
        assert.equal(player.location.toString(), "(2,-2)");

        player.action = GameAction.move(new Point(3, 0));
        gs.step();
        assert.equal(orb.location.toString(), "(-1,-5)");
        assert.equal(player.location.toString(), "(3,0)");

        player.action = GameAction.attract(0, true, false, true);
        gs.step();
        gs.step();
        gs.step();
        assert.equal(orb.location.toString(), "(0,-4)");
        assert.equal(player.location.toString(), "(3,-1)");

        player.action = GameAction.idle();
        gs.step();
        assert.equal(orb.location.toString(), "(0,-3)");
        assert.equal(player.location.toString(), "(3,-1)");
    });

    gopTestSinglePlayer("Orb tap switch prototick", new Point(2, 0), [new Point(2, 4), new Point(2, -4)], Altar.Air, "*A*B*A----",
        [
            new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0),
            new Point(2, 0), new Point(2, 0)
        ],
        [, new Point(2, -4)], 1
    );

    gopTestSinglePlayer("Orb double tap", new Point(2, 0), [new Point(2, -5)], Altar.Air, "*A*A-----",
        [
            new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0),
            new Point(2, 0), new Point(2, 0)
        ],
        [new Point(2, -3)], 0
    );

    gopTestSinglePlayer("Air orb near portal correct drag", new Point(2, 0), [new Point(-5, -8)], Altar.Air, "(2,2)*A{q}A{q}*AA[4]",
        [
            new Point(2, 2), new Point(2, 2), new Point(2, 0), new Point(2, -2), new Point(0, -3),
            new Point(0, -5), new Point(-2, -7), new Point(-3, -7)
        ],
        [new Point(-4, -6)], 0
    );

    gopTestSinglePlayer("Air orb near portal correct drag #2", new Point(1, 2), [new Point(-5, -8)], Altar.Air, "*AAA",
        [new Point(1, 2), new Point(2, 1), new Point(2, 1)],
        [new Point(-4, -6)], 0
    );

    gopTestSinglePlayer("Prototick when clicking moving orb again", new Point(0, -2), [new Point(-5, 1)], Altar.Air, "*AA(-3,0)*AA",
        [new Point(-2, -2), new Point(-2, -2), new Point(-3, 0), new Point(-3, 0), new Point(-4, 0)],
        [new Point(-3, 0)], 0
    );

    gopTestSinglePlayer("Repel pillar orb when it moves on top of player #1", new Point(0, -2), [new Point(-5, 1)], Altar.Air, "*AA(-3,0){q}*AA---",
        [
            new Point(-2, -2), new Point(-2, -2), new Point(-3, 0), new Point(-3, 0), new Point(-4, 0),
            new Point(-4, 0), new Point(-4, 0), new Point(-4, 0)
        ],
        [], 1
    );

    gopTestSinglePlayer("Clicking pillar orb again when out of reach", new Point(-1, -2), [new Point(2, -7)], Altar.Air, "*AA*A{q}A----",
        [
            new Point(-1, -2), new Point(-1, -2), new Point(0, -4), new Point(0, -5), new Point(0, -5),
            new Point(0, -5), new Point(0, -5), new Point(0, -5)
        ],
        [], 1
    );

    gopTestSinglePlayer("Switch from repel to attract should not immediately reach far orb", new Point(0, -2), [new Point(2, 8)], Altar.Air, "{q}*A{q}A-",
        [
            new Point(2, -2), new Point(2, 0), new Point(2, 0)
        ],
        [new Point(2, 8)], 0
    );

    gopTestSinglePlayer("Clicking pillar orb again when out of reach with prototick", new Point(-1, -2), [new Point(1, -6)], Altar.Air, "*A*A{q}AA----",
        [
            new Point(-1, -2), new Point(0, -4), new Point(0, -5), new Point(0, -5), new Point(0, -5),
            new Point(0, -5), new Point(0, -5), new Point(0, -5)
        ],
        [], 1
    );

    gopTestSinglePlayer("Test for no prototick when held", new Point(2, 0), [new Point(-1, 8), new Point(-4, 2)], Altar.Air, "(1,-2)*AA[5]*B----",
        [
            new Point(2, -2), new Point(2, -2), new Point(2, -2), new Point(2, -2), new Point(2, 0),
            new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0),
            new Point(2, 0), new Point(2, 0)
        ],
        [], 2
    );

    gopTestSinglePlayer("Should not move when switching to repel between orbs", new Point(2, -2), [new Point(-1, -5), new Point(2, 8)], Altar.Air, "{q}*AA{q}*B",
        [
            new Point(2, -2), new Point(2, -2), new Point(2, -2)
        ],
        [], 0
    );

    gopTestSinglePlayer("Prototick after one square move", new Point(0, -2), [new Point(-4, 2), new Point(2, 5)], Altar.Air, "*A*BBB----",
        [
            new Point(0, -2), new Point(2, -2), new Point(2, -2), new Point(2, -2), new Point(2, -2),
            new Point(2, -2), new Point(2, -2), new Point(2, -2)
        ],
        [, new Point(2, 3)], 1
    );

    gopTestSinglePlayer("Fancy repel trick angle for pillar #4", new Point(0, 2), [new Point(1, -8)], Altar.Air, "{r}*A{q}A{r}{q}AA-*A----",
        [
            new Point(-1, 2), new Point(-2, 2), new Point(-2, 0), new Point(-2, 0), new Point(-2, 0),
            new Point(-2, 0), new Point(-2, 0), new Point(-2, 0), new Point(-2, 0), new Point(-2, 0)
        ],
        [], 1
    );

    gopTestSinglePlayer("Prototick delay takes precedence over move delay", new Point(0, -2), [new Point(1, 7), new Point(1, 7)], Altar.Air, "(-1,-2)*A{r}{q}A{r}{q}*B{q}B----",
        [
            new Point(-1, -2), new Point(-1, -2), new Point(-2, -2), new Point(-2, -2), new Point(-2, 0),
            new Point(-2, 0), new Point(-2, 0), new Point(-2, 0), new Point(-2, 0)
        ],
        [new Point(1, 5), new Point(1, 7)], 0
    );

    gopTestSinglePlayer("Prototick takes precedence over move delay after moving", new Point(0, -2), [new Point(2, 8), new Point(2, -4)], Altar.Air, "*A{q}A{q}*A*B-[4]",
        [
            new Point(2, -2), new Point(2, 0), new Point(2, 0), new Point(2, 0), new Point(2, 0),
            new Point(2, 0), new Point(2, 0), new Point(2, 0)
        ],
        [new Point(2, 6)], 1
    );

    // TODO
    //gopTestSinglePlayer("TODO: repel while orb is moving to a too-far position should cancel and not move player", new Point(-11, -5), [new Point(-6, 0)], Altar.MIND, "{q}*A(-13,-5)*AA",
    //    [
    //        new Point(-11, -5), new Point(-13, -5), new Point(-13, -5), new Point(-13, -5)
    //    ],
    //    [new Point(-4, 2)], 0
    //);
});
