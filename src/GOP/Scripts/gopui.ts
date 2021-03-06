﻿interface GopUIOptions {
    game?: {
        numberOfOrbs?: number,
        reachDistance?: number,
        ticksPerAltar?: number,
        seed?: number,
        altar?: Altar,
        code?: string,
        startLocations?: Point[],
        presetSpawns?: Point[],
        suppressRandomSpawns?: boolean
    };

    client?: {
        visibilityRadius?: number,
        latency?: number,
        tickInterval?: number,
        useServer?: boolean,
        enablePlayerSwitching?: boolean,
        altarAndStartLocationForced?: boolean,
        allowInput?: boolean,
        gopControls?: {
            run?: string,
            repeller?: string,
            attractor?: string
        },
    };

    callbacks?: {
        setActionCallback: (action: GameAction) => void
        isGameFinished: () => boolean,
        tick: (force: boolean, redraw: boolean) => void
    };

    interface?: {
        showNavigationButtons?: boolean,
        plusMinusTicksAdvance?: number,
        margin?: number,
        showScore?: boolean,
        showGameCode?: boolean,
        showRestart?: boolean,
        showSave?: boolean,
        showTickTextSuffix: boolean,
        requireLoginToSave?: boolean,
    };
}

class GopUI {
    defaults: GopUIOptions = {
        game: {
            numberOfOrbs: 3,
            reachDistance: 10,
            ticksPerAltar: 199,
            seed: 5489,
            altar: Altar.Air,
            startLocations: [new Point(2, 0)],
            presetSpawns: [],
            suppressRandomSpawns: false
        },

        client: {
            visibilityRadius: 15,
            latency: 0,
            tickInterval: 600,
            useServer: false,
            enablePlayerSwitching: true,
            altarAndStartLocationForced: false,
            allowInput: true,
            gopControls: {
                run: "r",
                repeller: "q",
                attractor: "z"
            },
        },

        callbacks: {
            setActionCallback: action => undefined,
            isGameFinished: (): boolean => this.gameState.currentTick >= GameState.ticksPerAltar,
            tick: (force, redraw) => undefined
        },

        interface: {
            showNavigationButtons: true,
            plusMinusTicksAdvance: 7,
            margin: 12,
            showScore: true,
            showGameCode: true,
            showRestart: true,
            showSave: true,
            showTickTextSuffix: true,
            requireLoginToSave: false,
        }
    };

    options = this.defaults;
    gameState: GameState;
    gopCanvas: GopCanvas;
    gameplayData: GameplayData;

    $canvas = $('<canvas class="pull-left" moz-opaque>You do not have a HTML5-enabled browser. You should download the latest version of your browser.</canvas>');
    canvas = <HTMLCanvasElement>this.$canvas[0];
    $popupMenu = $('<div class="context-menu" style="display: none"></div>');
    // Interface elements
    $runCheckBox = $('<input type="checkbox"/>');
    $repelCheckBox = $('<input type="checkbox"/>');
    $playerControlsDiv: JQuery;

    $minusTicksButton: JQuery;
    $plusTicksButton: JQuery;
    $minusPlusTicksDiv: JQuery;

    $restartButton = $('<button type="button" class="btn btn-warning side">Restart</button>');
    $saveButton = $('<button type="button" class="btn btn-primary side" disabled="disabled">Save</button>');

    $scoredTicksSpan = $('<div class="monospaced scored-ticks"/>');
    $scoredTicksDiv = $('<div class="side-container"><header>Scored ticks</header></div>').append(this.$scoredTicksSpan);

    $gameCodeText = $('<div class="monospaced text-left"></div>');
    $gameCodeDiv = $('<div class="side-container break-word"><header>Game code</header></div>').append(this.$gameCodeText);

    $sidebar = $('<div style="display: inline-block"/>');
    $rootContainer = $('<div style="display: inline-block"/>');

    lastTimestamp = 0;
    animationHandle: number = null;
    mousePosition: Point = null;
    canvasFocused = false;
    canvasContextMenuFocused = false;

    onclick = (p: Point) => true;

    constructor(element: HTMLElement, options: GopUIOptions) {
        this.options = $.extend(true, {}, this.defaults, options);

        if (!(this.options.game.altar in AltarData)) {
            this.options.game.altar = Altar.Air;
        }

        this.gameState = new GameState(new GopBoard(53, 53, this.options.game.reachDistance),
            this.options.game.startLocations,
            this.options.game.presetSpawns,
            this.options.game.numberOfOrbs,
            this.options.game.seed,
            this.options.game.altar);

        this.gameplayData = new GameplayData(new GameStartInfo(this.options.game.seed, this.options.game.altar,
            this.options.game.startLocations.map(p => new PlayerStartInfo(p, true, false))));

        this.$playerControlsDiv = $('<div class="side-container"></div>').append(
            $("<label>Run (" + this.options.client.gopControls.run + ")</label>").prepend(this.$runCheckBox),
            "&nbsp;",
            $("<label>Repel (" + this.options.client.gopControls.repeller + "/" + this.options.client.gopControls.attractor + ")</label>").prepend(this.$repelCheckBox));
        this.$sidebar
            .append(this.$playerControlsDiv);
        if (this.options.interface.showNavigationButtons) {
            this.$minusTicksButton = $('<button type="button" class="btn btn-default">-' + this.options.interface.plusMinusTicksAdvance + " ticks</button>");
            this.$plusTicksButton = $('<button type="button" class="btn btn-default">+' + this.options.interface.plusMinusTicksAdvance + " ticks</button>");
            this.$minusPlusTicksDiv = $('<div class="side text-center"/>').append(this.$minusTicksButton, "&nbsp;", this.$plusTicksButton);

            this.$sidebar.append(this.$minusPlusTicksDiv);
        }
        if (this.options.interface.showRestart) {
            this.$sidebar.append($("<div/>").append(this.$restartButton));
        }
        if (this.options.interface.showSave) {
            this.$sidebar.append($("<div/>").append(this.$saveButton));
        }
        this.$sidebar.append(this.$scoredTicksDiv);
        if (this.options.interface.showGameCode) {
            this.$sidebar.append(this.$gameCodeDiv);
        }
        this.$rootContainer
            .css({ marginTop: this.options.interface.margin, marginBottom: this.options.interface.margin })
            .append(this.$canvas, this.$sidebar);
        $(element).append(this.$rootContainer);
        $("body").append(this.$popupMenu);
        this.init();
    }

    get player() {
        return this.gopCanvas.player;
    }

    set player(value) {
        this.gopCanvas.player = value;
    }

    hidePopupMenu() {
        this.$popupMenu.hide();
        this.canvasFocused = true;
    }

    /**
     * Recalculates the canvas size and returns whether the canvas needs to be redrawn.
     */
    recalculateCanvasSize() {
        let numCells = 2 * this.options.client.visibilityRadius + 1;
        let oldSize = this.canvas.width;
        let newSize = numCells * Math.min(27, Math.max(4, Math.floor(($(window).innerHeight() - this.options.interface.margin) / numCells)));
        if (oldSize !== newSize) {
            this.canvas.width = this.canvas.height = newSize;
        }
        return oldSize !== newSize;
    }

    onMinusTicksClicked() {
        let tickToLoad = this.gameState.currentTick - this.options.interface.plusMinusTicksAdvance;
        this.restartGame(this.gameplayData.toString(), undefined, undefined, this.player.index, false);
        for (let i = 0; i < tickToLoad; i++) {
            this.tick(true, false);
        }
        this.isGameRunning = true;
        this.updateDisplay();
    }

    onPlusTicksClicked() {
        for (let i = 0; i < this.options.interface.plusMinusTicksAdvance; i++) {
            this.tick(false, false);
        }
        this.updateDisplay();
    }

    init() {
        this.recalculateCanvasSize();
        this.gopCanvas = new GopCanvas(this.canvas, this.gameState, this.options.client.visibilityRadius, 0);

        if (this.options.game.suppressRandomSpawns) {
            this.gameState.respawnOrbs = false;
        }
        GameState.ticksPerAltar = this.options.game.ticksPerAltar;

        $(window).resize(() => {
            if (this.recalculateCanvasSize()) {
                this.gopCanvas.calculateDimensions();
                this.gopCanvas.paintBackground();
                this.gopCanvas.paint();
            }
        });

        $(document).keydown(e => {
            if (this.isGameFocused()) {
                switch (e.which) {
                    case GopUI.getKeyCodeFor(this.options.client.gopControls.repeller):    // Q
                        e.preventDefault();
                        this.setPlayerRunAndRepel(null, true);
                        break;
                    case GopUI.getKeyCodeFor(this.options.client.gopControls.attractor):   // Z
                        e.preventDefault();
                        this.setPlayerRunAndRepel(null, false);
                        break;
                    case GopUI.getKeyCodeFor(this.options.client.gopControls.run):    // R
                        if (e.shiftKey) {
                            // Restart
                            e.preventDefault();
                            this.$restartButton.click();
                        } else {
                            // Toggle run
                            e.preventDefault();
                            this.setPlayerRunAndRepel(!this.player.run, null);
                        }
                        break;
                    case 8:     // Backspace
                    case 37:    // Left arrow
                    case 189: case 109:   // Minus
                        e.preventDefault();
                        this.$minusTicksButton.click();
                        break;
                    case 39:    // Right arrow
                    case 187: case 107:   // Equals (plus)
                        e.preventDefault();
                        this.$plusTicksButton.click();
                        break;
                    case 88:    // X
                        this.gopCanvas.rotationAngle += Math.PI / 2;
                        this.gopCanvas.rotationAngle %= 2 * Math.PI;
                        break;
                    case 70:    // F
                        if (!e.shiftKey && !e.ctrlKey) {
                            e.preventDefault();
                            this.$rootContainer[0].scrollIntoView(true);
                        }
                        break;
                    case 49: 	// 1-5
                    case 50:
                    case 51:
                    case 52:
                    case 53:
                        if (this.options.client.enablePlayerSwitching) {
                            let player = this.gameState.players[e.which - 49];
                            if (player !== undefined) {
                                this.player = player;
                                // Repaint
                                this.gopCanvas.paint();
                            }
                        }
                        break;
                    default:
                        break;
                }
            }
        });

        this.$canvas
            .mousedown(this.onCanvasMouseDown.bind(this))
            .on("contextmenu", e => e.preventDefault())
            .mousemove(e => {
                //let loc = GopUI.getMouseClickLocation(e);
                //let p = this.gopCanvas.fromScreenCoords(loc.x, loc.y, false);
                //let pTrunc = this.gopCanvas.fromScreenCoords(loc.x, loc.y, true);
                let menuMargin = 20;
                this.canvasFocused = true;
                let popupMenu = this.$popupMenu[0];
                if (e.pageX < popupMenu.offsetLeft - menuMargin || e.pageX > popupMenu.offsetLeft + popupMenu.offsetWidth + menuMargin ||
                    e.pageY < popupMenu.offsetTop - menuMargin || e.pageY > popupMenu.offsetTop + popupMenu.offsetHeight + menuMargin) {
                    this.hidePopupMenu();
                }
                this.mousePosition = GopUI.getMouseClickLocation(e);
                this.updatePointer();
            })
            .mouseleave(() => { this.canvasFocused = false; });

        this.$runCheckBox.click(e => {
            if (this.isGameRunning) {
                e.preventDefault();
            }
            this.setPlayerRunAndRepel(!this.player.run, null);
        });
        this.$repelCheckBox.click(e => {
            if (this.isGameRunning) {
                e.preventDefault();
            }
            this.setPlayerRunAndRepel(null, !this.player.repel);
        });
        this.$minusTicksButton.click(() => this.onMinusTicksClicked());
        this.$plusTicksButton.click(() => this.onPlusTicksClicked());
        this.$restartButton.click(() => {
            if (this.options.client.allowInput) {
                this.restartGame(undefined, undefined, undefined, this.player.index);
            }
        });

        this.$popupMenu
            .on("contextmenu", e => e.preventDefault())
            .mouseenter(() => { this.canvasContextMenuFocused = true; })
            .mouseleave(() => { this.canvasContextMenuFocused = false; });

        this.restartGame(this.options.game.code);
    }

    restartGame(code?: string, seed?: number, altar?: Altar, playerIndex = 0, redraw = true) {
        this.isGameRunning = false;

        if (code != null) {
            this.gameplayData = GameplayData.parse(code);
            let startInfo = this.gameplayData.startInfo;
            this.gameState.altar = startInfo.altar;
            this.gameState.seed = startInfo.seed;
            this.gameState.players = startInfo.players.map((value, index) => {
                let player = new Player(this.gameState, value.location, index);
                player.run = value.run;
                player.repel = value.repel;
                return player;
            });
            this.isGameRunning = true;
        } else {
            if (seed != null) {
                this.gameState.seed = seed;
            }
            if (altar in AltarData) {
                this.gameState.altar = altar;
            }
            this.gameplayData = new GameplayData(new GameStartInfo(this.gameState.seed, this.gameState.altar,
                this.gameState.players.map(player => new PlayerStartInfo(player.location, player.run, player.repel))));

            this.$runCheckBox.prop("checked", this.player.run);
            this.$repelCheckBox.prop("checked", this.player.repel);
        }

        this.player = this.gameState.players[playerIndex];

        if (this.options.client.altarAndStartLocationForced) {
            this.gameState.altar = this.options.game.altar;
            this.gameState.players.forEach((p, i) => {
                p.location = this.options.game.startLocations[i];
            });
        }

        this.gameState.players.forEach(player => {
            player.action = GameAction.idle();
            player.freeze();
        });

        Utils.loadAltar(this.gameState.altar).fail(() => { this.gameState.altar = Altar.None; }).always(() => {
            this.gameState.reset();
            if (redraw) {
                this.gopCanvas.paintBackground();
                this.gopCanvas.paint();
                this.updateDisplay();
            }

            // Disable the save button.
            this.$saveButton.prop("disabled", true);
        });
    }

    onCanvasMouseDown(e: JQueryMouseEventObject) {
        let onContextMenuAttractOrbMouseDown = (orbIndex: number) => {
            return (eInner: JQueryMouseEventObject) => {
                if (eInner.button === 0) {
                    this.setPlayerAction(GameAction.attract(orbIndex, false, false, true));
                    this.hidePopupMenu();
                }
                eInner.preventDefault();
            };
        };

        let loc = GopUI.getMouseClickLocation(e);
        let p = this.gopCanvas.fromScreenCoords(loc.x, loc.y, false);
        let pTrunc = this.gopCanvas.fromScreenCoords(loc.x, loc.y, true);
        let i: number;

        if (e.button === 0) {
            // Left-click.
            this.hidePopupMenu();
            if (!this.onclick(pTrunc)) {
                return;
            }
            let foundOrb = false;
            for (i = 0; i < this.gameState.orbs.length; ++i) {
                if (this.isMouseOverOrb(p, this.gopCanvas.getDrawLocation(this.gameState.orbs[i]))) {
                    // Attract orb!
                    this.setPlayerAction(GameAction.attract(i, false, false, true));
                    foundOrb = true;
                    break;
                }
            }
            if (!foundOrb) {
                if (pTrunc.equals(this.player.location) || (GopBoard.isInAltar(pTrunc) && GopBoard.isPlayerAdjacentToAltar(this.player.location))) {
                    this.setPlayerAction(GameAction.idle());
                } else if (GopBoard.isInAltar(pTrunc)) {
                    // Find closest square
                    this.setPlayerAction(GameAction.move(this.gameState.board.nearestAltarPoint(this.player.location, PathMode.Player)));
                } else {
                    this.setPlayerAction(GameAction.move(pTrunc));
                }
            }
        } else if (e.button === 2) {
            // Clear all menu items
            this.$popupMenu.find("a").remove();

            for (i = 0; i < this.gameState.orbs.length; ++i) {
                if (this.isMouseOverOrb(p, this.gopCanvas.getDrawLocation(this.gameState.orbs[i]))) {
                    // Add attract and repel menu items
                    let attractMenuItem = $("<a class='context-menu-item'></a>")
                        .html((this.player.repel ? "Repel" : "Attract") + " <span style='color: yellow;'>Orb " + GameAction.orbIndexToChar(i) + "</span>")
                        .mousedown(onContextMenuAttractOrbMouseDown(i)).on("contextmenu", eInner => eInner.preventDefault());
                    //let repelMenuItem = document.createElement("a");
                    this.$popupMenu.append(attractMenuItem);
                }
            }

            let walkMenuItem = $("<a class='context-menu-item'>Walk to " + pTrunc + "</a>")
                .mousedown(eInner => {
                    if (eInner.button === 0) {
                        this.hidePopupMenu();
                        if (!this.onclick(pTrunc)) {
                            return;
                        }
                        this.setPlayerAction(GameAction.move(pTrunc));
                    }
                    eInner.preventDefault();
                }).on("contextmenu", eInner => eInner.preventDefault());

            this.$popupMenu.append(walkMenuItem).css({
                "position": "absolute",
                "left": e.pageX - 25,
                "top": e.pageY + 1
            }).show();
        }
    }

    setPlayerAction(action: GameAction) {
        if (!this.options.client.allowInput) {
            return;
        }

        if (!this.options.client.useServer) {
            let f = () => {
                // Don't touch run and repel
                action.toggleRun = this.player.action.toggleRun;
                action.changeWand = this.player.action.changeWand;
                this.player.action = action;
                // Erase gameplay data after the current tick.
                this.gameplayData.actions.sliceForPlayer(this.player.index, this.gameState.currentTick);
            };

            if (this.options.client.latency > 0) {
                setTimeout(f, this.options.client.latency);
            } else {
                f();
            }
        }

        this.options.callbacks.setActionCallback(action);
        if (!this.isGameRunning && !this.options.callbacks.isGameFinished()) {
            this.isGameRunning = true;
            this.tick();
        }
    }

    setPlayerRunAndRepel(run?: boolean, repel?: boolean) {
        if (!this.options.client.allowInput) {
            return;
        }

        if (!this.isGameRunning && this.gameState.currentTick === 0) {
            let startPlayer = this.gameplayData.startInfo.players[this.player.index];
            if (run !== void 0 && run !== null) {
                startPlayer.run = this.player.run = run;
            }
            if (repel !== void 0 && repel !== null) {
                startPlayer.repel = this.player.repel = repel;
            }
            this.updateDisplay();
        } else {
            let f = () => {
                if (run !== undefined && run !== null) {
                    this.player.action.toggleRun = this.player.run !== run;
                }
                if (repel !== undefined && repel !== null) {
                    this.player.action.changeWand = this.player.repel !== repel;
                }
                // Erase gameplay data after the current tick.
                this.gameplayData.actions.sliceForPlayer(this.player.index, this.gameState.currentTick);
            };

            if (this.options.client.latency > 0) {
                setTimeout(f, this.options.client.latency);
            } else {
                f();
            }
        }
    }

    updateDisplay() {
        this.$runCheckBox.prop("checked", this.player.run);
        this.$repelCheckBox.prop("checked", this.player.repel);
        this.$scoredTicksSpan.html("<span>" + this.gameState.scoredTicks.join("</span>&nbsp;<span>") + "</span>");
        this.$gameCodeText.text(this.gameplayData.toString());
    }

    tick(force = false, redraw = true) {
        if (!force && !this.isGameRunning) {
            return;
        }
        this.gameState.players.forEach((player, index) => {
            let loadedActions = this.gameplayData.actions.getForPlayer(index);
            if (loadedActions.length > this.gameState.currentTick) {
                // Autoplay from game code
                player.action = loadedActions[this.gameState.currentTick];
            } else {
                // Insert current player's action
                this.gameplayData.actions.pushForPlayer(index, player.action.copy());
            }
        });

        this.gameState.step();
        // Set toggles to false so that the player doesn't continuously repel/attract/repel/attract/etc...
        this.gameState.players.forEach(player => { player.action = player.action.copy(true); });

        if (this.options.callbacks.isGameFinished()) {
            this.isGameRunning = false;
        }

        if (redraw) {
            this.updateDisplay();
        }

        this.options.callbacks.tick(force, redraw);
    }

    updatePointer() {
        if (this.mousePosition) {
            this.$canvas.css("cursor", this.isMouseOverAnyOrb(this.gopCanvas.fromScreenCoords(this.mousePosition.x, this.mousePosition.y, false)) ? "pointer" : "default");
        }
    }

    isMouseOverOrb(clickLoc: Point, orbLoc: Point) {
        let diff = clickLoc.subtract(orbLoc);
        return Math.abs(diff.x) < 0.5 * this.gopCanvas.orbSize && Math.abs(diff.y) < 0.5 * this.gopCanvas.orbSize;
    }

    isMouseOverAnyOrb(mouseLoc: Point) {
        return this.gameState.orbs.some(orb => this.isMouseOverOrb(mouseLoc, this.gopCanvas.getDrawLocation(orb)));
    }

    get isGameRunning() {
        return this.animationHandle !== null;
    }

    set isGameRunning(value) {
        this.gopCanvas.isRunning = value;
        if (this.isGameRunning !== value) {
            if (value) {
                this.lastTimestamp = performance.now();
                this.animationHandle = requestAnimationFrame(this.paint.bind(this));
            } else {
                cancelAnimationFrame(this.animationHandle);
                this.animationHandle = null;
                this.gopCanvas.tickProgress = 0;
                this.gopCanvas.paint();
            }
        }
    }

    isGameFocused() {
        return this.canvasFocused || this.canvasContextMenuFocused;
    }

    paint(timestamp: number) {
        if (this.isGameRunning) {
            this.gopCanvas.tickProgress += (timestamp - this.lastTimestamp) / this.options.client.tickInterval;
            if (this.gopCanvas.tickProgress >= 1) {
                this.tick();
                // Don't skip ticks
                this.gopCanvas.tickProgress -= Math.floor(this.gopCanvas.tickProgress);
            }
        } else {
            this.gopCanvas.tickProgress = 0;
        }
        this.gopCanvas.paint();
        this.animationHandle = requestAnimationFrame(this.paint.bind(this));
        this.updatePointer();
        this.lastTimestamp = timestamp;
        if (this.options.callbacks.isGameFinished()) {
            this.isGameRunning = false;
        }
    }

    /**
     * Returns the mouse click location of an event.
     */
    private static getMouseClickLocation(e: JQueryMouseEventObject | MouseEvent) {
        let offX = (e.offsetX || e.pageX - $(e.target).offset().left);
        let offY = (e.offsetY || e.pageY - $(e.target).offset().top);
        return new Point(offX, offY);
    }

    private static getKeyCodeFor(str: string) {
        if (str == null) {
            return 0;
        }

        if (str in GopUI.keyCodes) {
            return GopUI.keyCodes[str];
        }
        return str.toUpperCase().charCodeAt(0);
    }

    static keyCodes: { [id: string]: number } = { "/": 191, "N0": 96, "N1": 97 };
}
