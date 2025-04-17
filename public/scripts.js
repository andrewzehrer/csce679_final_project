let inputTimeout;

// const easternConf = ["ATL", "BOS", "BRK", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS"];
// const westernConf = ["DAL", "DEN", "GSW", "HOU", "LAC", "LAL", "MEM", "MIN", "NOP", "OKC", "PHX", "POR", "SAC", "SAS", "UTA"];
// const allTeams = [...easternConf, ...westernConf];


function getGraphTitle() {
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonDropdown").value.slice(0, 4);
    const selectedStat = getSelectedStat();

    const homeAwayFilter = document.getElementById("locationDropdown").value;
    const teamFilter = document.getElementById("teamDropdown").value;
    const winLossFilter = document.getElementById("resultDropdown").value;

    const statText = {
        "PTS": "Points",
        "AST": "Assists",
        "REB": "Rebounds",
        "STL": "Steals",
        "BLK": "Blocks"
    };

    const parts = [
        `${playerName}`,
        `- ${seasonYear}-${(parseInt(seasonYear) + 1).toString().slice(-2)}`,
        statText[selectedStat],
        homeAwayFilter !== "all" ? `(${capitalize(homeAwayFilter)})` : "",
        teamFilter !== "all" ? `(vs. ${teamFilter})` : "",
        winLossFilter !== "all" ? `(${winLossFilter === "W" ? "Wins" : "Losses"})` : ""
    ];

    // Join parts with a space and remove extra spaces
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getSelectedStat() {
    const selectedRadio = document.querySelector('input[name="stat"]:checked');
    return selectedRadio.value;
}

function handlePlayerInput() {
    clearTimeout(inputTimeout);
    fetchPlayerSuggestions();

    inputTimeout = setTimeout(() => {
        loadSeasons();
    }, 1000); // delay to reduce redundant fetches
}

async function fetchPlayerSuggestions() {
    const input = document.getElementById("playerNameInput");
    const datalist = document.getElementById("playerSuggestions");
    const query = input.value;

    if (!query.trim()) {
        datalist.innerHTML = ""; // Clear suggestions if input is empty
        return;
    }

    try {
        const res = await fetch(`http://localhost:5000/player-suggestions?query=${encodeURIComponent(query)}`);
        const suggestions = await res.json();

        // Populate the datalist with suggestions
        datalist.innerHTML = "";
        suggestions.forEach(player => {
            const option = document.createElement("option");
            option.value = player; // Set the value to the player's name
            datalist.appendChild(option);
        });
    } catch (err) {
        console.error("Error fetching player suggestions:", err);
    }
}

// Load seasons for a selected player
async function loadSeasons() {
    const playerName = document.getElementById("playerNameInput").value;
    const dropdown = document.getElementById("seasonDropdown");

    if (!playerName.trim()) return;

    dropdown.style.display = "none";
    dropdown.innerHTML = "<option>Loading...</option>";

    try {
        const res = await fetch(`http://localhost:5000/player-seasons?name=${encodeURIComponent(playerName)}`);
        const seasons = await res.json();

        if (res.status !== 200 || seasons.length === 0) {
            dropdown.innerHTML = "";
            dropdown.style.display = "none";
            return;
        }

        dropdown.innerHTML = "";
        seasons.forEach(season => {
            const option = document.createElement("option");
            option.value = season;
            option.textContent = season;
            dropdown.appendChild(option);
        });

        dropdown.style.display = "inline-block";

        const defaultSeason = "2024-25";
        if (seasons.includes(defaultSeason)) {
            dropdown.value = defaultSeason;
        } else {
            dropdown.selectedIndex = 0;
        }

        fetchPlayerStats(); // ← always call this here
    } catch (err) {
        console.error("Error fetching seasons:", err);
        dropdown.style.display = "none";
    }
}

async function fetchPlayerStats() {
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonDropdown").value.slice(0, 4);
    const selectedStat = getSelectedStat();

    const homeAwayFilter = document.getElementById("locationDropdown").value;
    const teamFilter = document.getElementById("teamDropdown").value;

    const resultFilter = document.getElementById("resultDropdown").value;

    const url = `http://localhost:5000/player-games?name=${encodeURIComponent(playerName)}&season=${encodeURIComponent(seasonYear)}`;
    const outputDiv = document.getElementById("output");
    outputDiv.innerText = "Loading...";

    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (res.status === 404) {
            outputDiv.innerText = "Player not found. Please check the name and try again.";
            return;
        } else if (res.status === 400) {
            outputDiv.innerText = "Invalid request. Please check the input values.";
            return;
        } else if (!res.ok) {
            outputDiv.innerText = "Error fetching data. Please try again later.";
            return;
        }

        const data = await res.json();

        if (data.error) {
            alert(data.error);
            outputDiv.innerText = "No data found.";
            return;
        }

        const filtered = data.filter(d => {
            const gameDate = new Date(d.GAME_DATE);
            const startDate = new Date(`${seasonYear}-10-01`); // Start of the season
            const endDate = new Date(`${seasonYear + 1}-04-30`); // End of the season
            return gameDate >= startDate && gameDate <= endDate;
        });

        if (filtered.length === 0) {
            outputDiv.innerText = "No data found for the specified player and season.";
            return;
        }

        filtered.sort((a, b) => new Date(a.GAME_DATE) - new Date(b.GAME_DATE));

        // Build running averages for each game
        const runningAverages = [];
        const cumulative = {
            PTS: 0,
            AST: 0,
            REB: 0,
            STL: 0,
            BLK: 0
        };

        filtered.forEach((d, i) => {
            cumulative.PTS += d.PTS;
            cumulative.AST += d.AST;
            cumulative.REB += d.REB;
            cumulative.STL += d.STL;
            cumulative.BLK += d.BLK;

            runningAverages.push({
                GAME_DATE: d.GAME_DATE,
                PTS_avg: cumulative.PTS / (i + 1),
                AST_avg: cumulative.AST / (i + 1),
                REB_avg: cumulative.REB / (i + 1),
                STL_avg: cumulative.STL / (i + 1),
                BLK_avg: cumulative.BLK / (i + 1)
            });
        });

        // Define reusable filter function for table totals
        const passesFilters = (d) => {
            const isLocationOk = homeAwayFilter === "all"
                || (homeAwayFilter === "home" && d.MATCHUP.indexOf('vs.') !== -1)
                || (homeAwayFilter === "away" && d.MATCHUP.indexOf('@') !== -1);

            const isTeamOk = teamFilter === "all"
                || d.MATCHUP.indexOf(teamFilter) !== -1;

            const isResultOk = resultFilter === "all"
                || (resultFilter === "W" && d.WL === 'W')
                || (resultFilter === "L" && d.WL === 'L');

            return isLocationOk && isTeamOk && isResultOk;
        };

        // Build testExpr string for Vega-Lite
        const locationExpr = homeAwayFilter === "all"
            ? "true"
            : homeAwayFilter === "home"
                ? `indexof(datum.MATCHUP, 'vs.') !== -1`
                : `indexof(datum.MATCHUP, '@') !== -1`;

        const teamExpr = teamFilter === "all"
            ? "true"
            : `indexof(datum.MATCHUP, '${teamFilter}') !== -1`;

        const resultExpr = resultFilter === "all"
            ? "true"
            : resultFilter === "W"
                ? `datum.WL === 'W'`
                : `datum.WL === 'L'`;

        const testExpr = `${locationExpr} && ${teamExpr} && ${resultExpr}`;

        const spec = {
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "title": {
                "text": getGraphTitle(),
                "anchor": "center",
                "fontSize": 20,
                "fontWeight": "bold",
                "dy": -10
            },
            "width": 800,
            "height": 400,
            "layer" : [
                { // Bar chart showing indiv. game stats
                    "data": { "values": filtered },
                    "mark": "bar",
                    "encoding": {
                        "x": {
                            "field": "GAME_DATE",
                            "type": "temporal",
                            "title": "Game Date"
                        }, "y": {
                            "field": selectedStat,
                            "type": "quantitative",
                            "title": "Points",
                            "axis": { "grid": true, "format": "d" }
                        }, "color": {
                            "condition": {
                                "test": testExpr,
                                "value": "steelblue"
                            },
                            "value": "lightgray"
                        },"tooltip": [
                            { "field": "GAME_DATE", "type": "temporal", "title": "Game Date" },
                            { "field": "MATCHUP", "type": "nominal", "title": "Matchup" },
                            { "field": "WL", "type": "nominal", "title": "Win/Loss" },
                            { "field": "PTS", "type": "quantitative", "title": "Points" },
                            { "field": "AST", "type": "quantitative", "title": "Assists" },
                            { "field": "REB", "type": "quantitative", "title": "Rebounds" },
                            { "field": "STL", "type": "quantitative", "title": "Steals" },
                            { "field": "BLK", "type": "quantitative", "title": "Blocks" }
                        ]
                    }
                },
                { // Line chart showing running averages
                    "data": { "values": runningAverages },
                    "mark": {
                        "type": "line",
                        "color": "orangered",
                        "strokeWidth": 2
                    },
                    "encoding": {
                        "x": { "field": "GAME_DATE", "type": "temporal" },
                        "y": {
                            "field": `${selectedStat}_avg`,
                            "type": "quantitative"
                        }
                    }
                },
                {
                    "data": { "values": runningAverages },
                    "mark": {
                        "type": "point",
                        "filled": true,
                        "color": "orangered",
                        "size": 50
                    },
                    "encoding": {
                        "x": { "field": "GAME_DATE", "type": "temporal" },
                        "y": {
                            "field": `${selectedStat}_avg`,
                            "type": "quantitative"
                        },
                        "tooltip": [
                            { "field": "GAME_DATE", "type": "temporal", "title": "Game Date" },
                            { "field": `${selectedStat}_avg`, "type": "quantitative", "title": `${selectedStat}/GM`, "format": ".2f" }
                        ]
                    }
                }
            ]    
        };

        vegaEmbed("#vis", spec);
        outputDiv.innerText = "";

        // fill totals table with filtered data
        const filteredForTotals = filtered.filter(passesFilters);

        const totals = { "PTS": 0, "AST": 0, "REB": 0, "STL": 0, "BLK": 0 };

        // apply testExpr to filtered data
        filteredForTotals.forEach(d => {
            totals.PTS += d.PTS;
            totals.AST += d.AST;
            totals.REB += d.REB;
            totals.STL += d.STL;
            totals.BLK += d.BLK;
        });

        // divide by games played
        const gamesPlayed = filteredForTotals.length;
        if (gamesPlayed > 0) {
            for (const key in totals) {
                totals[key] = (totals[key] / gamesPlayed).toFixed(2);
            }
        } else {
            for (const key in totals) {
                totals[key] = "0.00";
            }
        }

        document.getElementById("gamesPlayed").innerText = gamesPlayed;
        document.getElementById("ptsPerGame").innerText = totals.PTS;
        document.getElementById("astPerGame").innerText = totals.AST;
        document.getElementById("rebPerGame").innerText = totals.REB;
        document.getElementById("stlPerGame").innerText = totals.STL;
        document.getElementById("blkPerGame").innerText = totals.BLK;

    } catch (err) {
        console.error("Fetch error:", err);
        document.getElementById("output").innerText = "Error fetching data. Check console.";
    }
}

window.onload = () => {
    // document.getElementById("playerNameInput").value = "LeBron James"; // or any default player
    document.getElementById("seasonDropdown").addEventListener("change", fetchPlayerStats);
    document.getElementById("statSelection").addEventListener("change", fetchPlayerStats);
    document.getElementById("locationDropdown").addEventListener("change", fetchPlayerStats);
    document.getElementById("teamDropdown").addEventListener("change", fetchPlayerStats);
    document.getElementById("resultDropdown").addEventListener("change", fetchPlayerStats);

    handlePlayerInput();
}