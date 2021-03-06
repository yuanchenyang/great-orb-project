﻿import * as signalR from "../node_modules/signalr-client/dist/src/index"

interface PlayerInfo {
    connectionId: string;
    ipAddress: string;
    username: string;
    isReady: boolean;
    action: string;
    run: boolean;
    repel: boolean;
    isWatching: boolean;
    startLocation: { x: number, y: number };
}

enum ConnectionState { Initial, Connecting, Connected, Disconnected }
enum RunningState { NotReady, Ready, Countdown, Started, Ended }

class MultiplayerGopUI extends GopUI3D {
    sidePanel: MultiplayerSidePanel;
    hub: signalR.HubConnection;

    constructor(container: HTMLDivElement, gameState: GameState, playerIndex: number, public multiplayer: Multiplayer) {
        super(container, gameState, playerIndex);
        this.game = new MultiplayerGame(gameState, playerIndex, multiplayer);
        this.allowPlayerSwitching = false;
        this.sidePanel = new MultiplayerSidePanel(this);
        // Server sends the ticks.
        this.tickLength = 600;
        this.allowConfigureTickLength = false;
        this.autoTick = false;
    }

    get hub() { return this.multiplayer.hub; }

    // Override
    get isPaused() { return this.optionsMenu.visible; }

    // Override   
    init() {
        super.init();
        this.sidePanel.init();

        return this;
    }

    // Override
    setAltarAndSeed(altar: number, seed: number) {
        seed = Math.max(0, Math.min(2147483647, seed));
        // Does this altar exist? If not, load default altar.
        Utils.loadAltar(altar).fail(() => { altar = Altar.None; }).always(() => {
            if (this.hub.connection.state === $.signalR.connectionState.connected) {
                this.hub.server.setGameParams(altar, seed);
            }
        });
    }

    // Override
    restart(resetGameplayData = true) {
        if (resetGameplayData && this.game.isStarted) {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.setPlayerLocation(this.game.player.location.x, this.game.player.location.y);
                this.hub.server.sendNewGameSignal();
            }
        }
        super.restart(resetGameplayData);
    }

    // Override
    pause() {
        // Don't pause the game itself.
        this.optionsMenu.visible = true;
    }

    // Override    
    resume() {
        this.optionsMenu.visible = false;
    }

    // Override
    rewind(ticks = 7) {
        if (this.multiplayer.runningState === RunningState.Started) {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.rewind(ticks);
            }
        }
    }

    // Override
    fastForward(ticks = 7) {
        if (this.multiplayer.runningState === RunningState.Started) {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.fastForward(ticks);
            }
        }
    }

    // Override
    onSaveClicked() {
        let button = this.infoBox.saveButton;
        button.disabled = true;
        button.textContent = "Saving...";

        let filteredStartInfoPlayers = this.game.gameplayData.startInfo.players.filter((_, i) => {
            return this.multiplayer.players[i] != null && !this.multiplayer.players[i].isWatching;
        });

        let filteredActions = this.game.gameplayData.actions.rawActions.filter((_, i) => {
            return this.multiplayer.players[i] != null && !this.multiplayer.players[i].isWatching;
        });

        let filteredGameplayData = new GameplayData(
            new GameStartInfo(this.gameState.seed, this.gameState.altar, filteredStartInfoPlayers),
            new GameActionList(filteredActions));

        $.post("/api/multiplayer/", {
            playerNames: this.multiplayer.players.filter(p => !p.isWatching).map(p => p.username),
            numberOfOrbs: this.gameState.numberOfOrbs,
            seed: this.gameState.seed,
            altar: this.gameState.altar,
            score: this.gameState.score,
            code: filteredGameplayData.toString()
        }, () => {
            button.textContent = "Saved";
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.notifySaved();
            }
        });
    }

    // These methods call the original rewind and fast forward methods.
    clientRewind(ticks: number) {
        super.rewind(ticks);
    }

    clientFastForward(ticks: number) {
        super.fastForward(ticks);
    }

    updatePlayerInfo(players: PlayerInfo[]) {
        this.sidePanel.updatePlayerInfo(players);
    }
}

class MultiplayerSidePanel {
    element: HTMLDivElement;
    watchingCheckBox: HTMLInputElement;
    startButton: HTMLButtonElement;
    playerInfoDiv: HTMLDivElement;

    constructor(private gopui: MultiplayerGopUI) {
        this.startButton = document.createElement("button");
        this.playerInfoDiv = document.createElement("div");
    }

    get hub() { return this.gopui.hub; }

    get runningState() { return this.gopui.multiplayer.runningState; }
    set runningState(value) { this.gopui.multiplayer.runningState = value; }

    init() {
        this.element = $("<div/>").addClass("multiplayer-panel")[0] as HTMLDivElement;

        let controlsDiv = document.createElement("div");
        controlsDiv.style.pointerEvents = "auto";

        let $watchingDiv = $('<div><label><input type="checkbox"/>Watching</label></div>');
        this.watchingCheckBox = $watchingDiv.find("input")[0] as HTMLInputElement;
        this.watchingCheckBox.defaultChecked = true;
        this.watchingCheckBox.addEventListener("change", e => {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.setWatching(this.watchingCheckBox.checked);
            }
            this.startButton.disabled = this.watchingCheckBox.checked;
        });
        controlsDiv.appendChild($watchingDiv[0]);

        this.startButton.className = "btn btn-primary";
        this.startButton.textContent = "Set Ready";
        this.startButton.disabled = this.watchingCheckBox.checked;
        this.startButton.addEventListener("click", e => {
            switch (this.runningState) {
                case RunningState.NotReady:
                    if ($.connection.hub.state === $.signalR.connectionState.connected) {
                        this.hub.server.setReady(true);
                    }
                    this.runningState = RunningState.Ready;
                    break;
                case RunningState.Ready:
                    if ($.connection.hub.state === $.signalR.connectionState.connected) {
                        this.hub.server.setReady(false);
                    }
                    this.runningState = RunningState.NotReady;
                case RunningState.Started:
                    this.gopui.restart();
                    break;
                case RunningState.Ended:
                    this.gopui.restart();
                    break;
                default:
                    break;
            }
        });
        controlsDiv.appendChild(this.startButton);

        this.element.appendChild(controlsDiv);
        this.element.appendChild(this.playerInfoDiv);

        this.gopui.container.appendChild(this.element);
    }

    updatePlayerInfo(players: PlayerInfo[]) {
        let ol = document.createElement("ol");
        players.forEach((playerInfo, i) => {
            let li = document.createElement("li");
            li.textContent = playerInfo.username;
            li.style.color = this.gopui.playerColors[i];
            if (playerInfo.isWatching) {
                li.textContent += " (watching)";
            } else if (!playerInfo.isReady) {
                li.textContent += " (not ready)";
            }
            if (playerInfo.action != null) {
                li.textContent += " - " + playerInfo.action;
            }
            if (i === this.gopui.playerIndex) {
                li.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                li.style.fontWeight = "bold";
            }
            ol.appendChild(li);
        });
        if (this.playerInfoDiv != null) {
            $(this.playerInfoDiv).empty().append("Connected players:").append(ol);
        }
    }
}

class MultiplayerGame extends Game {
    constructor(gameState: GameState, playerIndex: number, private multiplayer: Multiplayer) {
        super(gameState, playerIndex);
    }

    get hub() { return this.multiplayer.hub; }

    get runningState() { return this.multiplayer.runningState; }

    setMyAction(action: GameAction) {
        // Don't touch run and repel player settings.
        action.toggleRun = this.player.action.toggleRun;
        action.changeWand = this.player.action.changeWand;

        if (this.runningState === RunningState.NotReady) {
            if (action.type === ActionType.Move) {
                if ($.connection.hub.state === $.signalR.connectionState.connected) {
                    this.hub.server.setPlayerLocation(action.location.x, action.location.y);
                }
            }
        } else if (this.runningState === RunningState.Countdown || this.runningState === RunningState.Started) {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.sendAction(action.toString());
            }
        }

        // Erase gameplay data after current tick.
        this.gameplayData.actions.sliceForPlayer(this.playerIndex, this.gameState.currentTick);
    }

    setMyRunAndRepel(run?: boolean, repel?: boolean) {
        if (run != null) {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.sendRun(run);
            }
        }
        if (repel != null) {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.sendRepel(repel);
            }
        }
        if (!this.isStarted) {
            super.setMyRunAndRepel(run, repel);
        }
    }
}

class Multiplayer {
    gopui: MultiplayerGopUI;
    hub: signalR.HubConnection;
    players: PlayerInfo[];

    private _runningState = RunningState.NotReady;

    constructor(container: HTMLDivElement) {
        let gs = new GameState(new GopBoard(53, 53), [new Point(2, 0), new Point(-2, 0)]);
        this.gopui = new MultiplayerGopUI(container, gs, 0, this);
    }

    get game() { return this.gopui.game as MultiplayerGame; }
    get currentPlayer() { return this.players[this.gopui.playerIndex]; }

    get runningState() { return this._runningState; }
    set runningState(value) {
        if (this._runningState !== value) {
            this._runningState = value;
            let startButton = this.gopui.sidePanel.startButton;
            let watchingCheckBox = this.gopui.sidePanel.watchingCheckBox;
            let isWatching = this.currentPlayer.isWatching;
            switch (this._runningState) {
                case RunningState.NotReady:
                    startButton.textContent = "Set Ready";
                    startButton.disabled = isWatching;
                    watchingCheckBox.disabled = false;
                    break;
                case RunningState.Ready:
                    startButton.textContent = "Set Not Ready";
                    startButton.disabled = false;
                    watchingCheckBox.disabled = true;
                    break;
                case RunningState.Countdown:
                    startButton.disabled = true;
                    watchingCheckBox.disabled = true;
                    break;
                case RunningState.Started:
                    startButton.textContent = "Restart";
                    startButton.disabled = isWatching;
                    watchingCheckBox.disabled = true;
                    break;
                case RunningState.Ended:
                    startButton.textContent = "New Game";
                    startButton.disabled = isWatching;
                    watchingCheckBox.disabled = true;
                    break;
                default:
                    console.error("How did we get here?");
                    break;
            }
        }
    }

    init() {
        this.hub.client.updatePlayers = (players, arrayModified) => {
            this.players = players;
            if (arrayModified) {
                this.gopui.gameState.players = players.map((player, index) => {
                    let p = new Point(player.startLocation.x, player.startLocation.y);
                    return new Player(this.gopui.gameState, p, index);
                });
                this.gopui.initPlayerGraphics();
            } else if (this.runningState !== RunningState.Started) {
                for (let player of this.gopui.gameState.players) {
                    let serverPlayer = players[player.index];
                    if (serverPlayer == null) {
                        continue;
                    }
                    player.location = new Point(serverPlayer.startLocation.x, serverPlayer.startLocation.y);
                    player.prevLocation = Point.NaN;
                }
                this.game.resetGameplayData();
                this.gopui.initPlayerGraphics();
                this.gopui.updateDisplay();
            }

            for (let player of this.gopui.gameState.players) {
                let serverActionStr = players[player.index].action;
                if (serverActionStr != null) {
                    player.action = GameAction.parse(serverActionStr);
                    this.gopui.game.gameplayData.actions.sliceForPlayer(player.index, this.gopui.gameState.currentTick);
                    // actions[i] = actions[i].slice(0, gopui.gameState.currentTick);
                }
            }

            this.gopui.updatePlayerInfo(players);
        };

        this.hub.client.removePlayer = index => {
            this.players.splice(index, 1);
            this.gopui.gameState.players.splice(index, 1);
            // Re-compute player indexes
            this.gopui.gameState.players.forEach((player, i) => {
                player.index = i;
            });
            this.gopui.updatePlayerInfo(this.players);
            this.gopui.initPlayerGraphics();
        };

        this.hub.client.setPlayerIndex = index => {
            this.gopui.playerIndex = index;
            if (this.players != null) {
                this.gopui.updatePlayerInfo(this.players);
            }
        };

        this.hub.client.setGameParams = (altar, seed) => {
            Utils.loadAltar(altar).always(() => {
                this.gopui.gameState.altar = altar;
                this.gopui.gameState.seed = seed;
                this.gopui.restart();
            });
        };

        this.hub.client.rewindTo = tick => {
            this.gopui.clientRewind(this.gopui.gameState.currentTick - tick);
        };

        this.hub.client.fastForwardTo = tick => {
            this.gopui.clientFastForward(tick - this.gopui.gameState.currentTick);
            if (this.game.isFinished) {
                this.runningState = RunningState.Ended;
            }
        };

        this.hub.client.reject = players => {
            this.gopui.container.hidden = true;
            let names = players.map(p => p.username).join(players.length === 2 ? " and " : ", ");
            document.querySelector("#info").textContent = `Sorry, but ${names} ${players.length === 1 ? "is" : "are"} currently playing a game. When they are finished, the game will load automatically.`;
        };

        this.hub.client.notifyRejoin = () => {
            if (this.gopui.container.hidden && $.connection.hub.state === $.signalR.connectionState.connected) {
                this.gopui.container.hidden = false;
                document.querySelector("#info").textContent = "";
                this.hub.server.addCurrentPlayer();
            }
        };

        this.hub.client.notifySaved = () => {
            this.gopui.infoBox.saveButton.textContent = "Saved";
            this.gopui.infoBox.saveButton.disabled = true;
        };

        this.hub.client.setCountdown = countdown => {
            this.runningState = RunningState.Countdown;
            this.gopui.sidePanel.startButton.textContent = "Starting in " + countdown;
        };

        this.hub.client.newGame = () => {
            this.runningState = RunningState.NotReady;
            this.gopui.restart(true);
        };

        this.hub.client.tick = (players, currentTick) => {
            this.players = players;
            this.gopui.updatePlayerInfo(this.players);
            this.gopui.game.start();

            // Set player actions now
            players.forEach((player, i) => {
                this.game.setRunAndRepel(i, player.run, player.repel);
            });
            this.gopui.tick();
            this.gopui.tickProgress = 0;
            this.sendCurrentRunAndRepel();

            // This may have unintended consequences
            if (this.gopui.gameState.currentTick !== currentTick) {
                console.error("Ticks are not aligned");
                this.gopui.gameState.currentTick = currentTick;
            }
            if (this.gopui.game.isFinished) {
                this.runningState = RunningState.Ended;
            } else {
                this.runningState = RunningState.Started;
            }
        };

        $.connection.hub.logging = Utils.getQueryAsBoolean("debug", false);
        $.connection.hub.qs = `instance=${(document.querySelector("#instance") as HTMLInputElement).value}`;
        $.connection.hub.start().done(() => {
            this.gopui.init().startAnimation();
        }).fail(() => {
            alert("Failed to connect!");
        });
    }

    sendCurrentRunAndRepel() {
        // Send updated run and repel
        if (this.game.player.run !== this.players[this.game.player.index].run) {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.sendRun(this.game.player.run);
            }
        }
        if (this.game.player.repel !== this.players[this.game.player.index].repel) {
            if ($.connection.hub.state === $.signalR.connectionState.connected) {
                this.hub.server.sendRun(this.game.player.repel);
            }
        }
    }
}
