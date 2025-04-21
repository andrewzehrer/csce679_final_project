let inputTimeout;

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

////////////////////////////// Main function to fetch player stats ////////////////////////////////
async function fetchPlayerStats() {
    //////////////////////////////// Get input values ////////////////////////////////
    const playerName = document.getElementById("playerNameInput").value;
    const seasonYear = document.getElementById("seasonDropdown").value.slice(0, 4);
    const selectedStat = getSelectedStat();

    const homeAwayFilter = document.getElementById("locationDropdown").value;
    const teamFilter = document.getElementById("teamDropdown").value;
    const resultFilter = document.getElementById("resultDropdown").value;

    const showSeasonAvg = document.getElementById("showSeasonAvg").checked;
    const showRollingAvg = document.getElementById("showRollingAvg").checked;

    const url = `http://localhost:5000/player-games?name=${encodeURIComponent(playerName)}&season=${encodeURIComponent(seasonYear)}`;
    const outputDiv = document.getElementById("output");
    outputDiv.innerText = "Loading...";

    //////////////////////////////////// Fetch player stats from backend ////////////////////////////////
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

        ////////////////////////////////// Filter and process data ////////////////////////////////
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

        //////////////////////////////// Calculate season averages ////////////////////////////////
        const seasonAverages = {
            "PTS": 0,
            "AST": 0,
            "REB": 0,
            "STL": 0,
            "BLK": 0
        };
        
        const totalGames = filtered.length;
        filtered.forEach(d => {
            seasonAverages.PTS += d.PTS;
            seasonAverages.AST += d.AST;
            seasonAverages.REB += d.REB;
            seasonAverages.STL += d.STL;
            seasonAverages.BLK += d.BLK;
        });

        for (const key in seasonAverages) {
            seasonAverages[key] = (seasonAverages[key] / totalGames).toFixed(2);
        }

        // Calculate rolling 5-game averages
        const rollingStats = filtered.map((d, i) => {
            const start = Math.max(0, i - 4);
            const window = filtered.slice(start, i + 1);
            const values = window.map(g => g[selectedStat]);
            const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

            return {
                GAME_DATE: d.GAME_DATE,
                avg: avg
            };
        });

        //////////////////////////////// Filter data for table totals & chart ////////////////////////////////
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

        ///////////////////////////////// Chart layers /////////////////////////////////
        const activeSeries = [];
        const colors = [];

        if (showSeasonAvg) {
            activeSeries.push("Season Avg");
            colors.push("green");
        }

        if (showRollingAvg) {
            activeSeries.push("5-game Avg");
            colors.push("orangered");
        }

        const showLegend = activeSeries.length > 0;

        const layers = [
            { // Bar chart (always shown)
                "data": { "values": filtered },
                "mark": "bar",
                "encoding": {
                    "x": { 
                        "field": "GAME_DATE", 
                        "type": "temporal", 
                        "title": "Game Date" 
                    },
                    "y": { 
                        "field": selectedStat,
                        "type": "quantitative",
                        "axis": { 
                            "title": selectedStat === "PTS" ? "Points" :
                                    selectedStat === "AST" ? "Assists" :
                                    selectedStat === "REB" ? "Rebounds" :
                                    selectedStat === "STL" ? "Steals" :
                                    selectedStat === "BLK" ? "Blocks" : "",
                            "orient": "left"
                        }
                    },
                    "scale": {
                        "name": "y",
                        "nice": true,
                        "tickMinStep": 1
                    },
                    "color": {
                        "condition": { 
                            "test": testExpr, 
                            "value": "steelblue" 
                        },
                        "value": "lightgray"
                    },
                    "tooltip": [
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
            }
        ];

        // Add Season Average line (if shown)
        if (showSeasonAvg) {
            const avgLineData = filtered.map(d => ({
                GAME_DATE: d.GAME_DATE,
                value: seasonAverages[selectedStat],
                series: "Season Avg"
            }));

            layers.push({
                "data": { "values": avgLineData },
                "mark": { 
                    "type": "line", 
                    "strokeWidth": 2, 
                    "strokeDash": [4,2] 
                },
                "encoding": {
                    "x": { 
                        "field": "GAME_DATE", 
                        "type": "temporal" 
                    },
                    "y": { 
                        "field": "value", 
                        "type": "quantitative",
                        "scale": {
                            "name": "y",
                            "nice": true,
                            "tickMinStep": 1
                        },
                        "axis": { 
                            "orient": "left", 
                            "title": ""
                        }
                    },
                    "color": {
                        "field": "series",
                        "type": "nominal",
                        "scale": { 
                            "domain": activeSeries, 
                            "range": colors 
                        },
                        "legend": showLegend ? { "title": "Legend" } : null
                    },
                    "tooltip": [
                        {
                            "field": "value", 
                            "type": "quantitative", 
                            "title": `Season Avg ${selectedStat}` 
                        }
                    ]
                }
            });
        }

        // Add Rolling 5-game Average line (if shown)
        if (showRollingAvg) {
            layers.push({
                "data": { 
                    "values": rollingStats.map(d => ({...d, series: "5-game Avg"})) 
                },
                "mark": { 
                    "type": "line", 
                    "strokeWidth": 2, 
                    "point": true
                },
                "encoding": {
                    "x": { "field": "GAME_DATE", "type": "temporal" },
                    "y": { 
                        "field": "avg", 
                        "type": "quantitative",
                        "scale": {
                            "name": "y",
                            "nice": true,
                            "tickMinStep": 1
                        },
                        "axis": { 
                            "orient": "left", 
                            "title": ""
                        }
                    },
                    "color": {
                        "field": "series",
                        "type": "nominal",
                        "scale": { 
                            "domain": activeSeries, 
                            "range": colors 
                        },
                        "legend": showLegend ? { "title": "Legend" } : null
                    },
                    "tooltip": [
                        { 
                            "field": "GAME_DATE",
                            "type": "temporal",
                            "title": "Game Date" 
                        },
                        { 
                            "field": "avg",
                            "type": "quantitative",
                            "title": `Avg ${selectedStat} last 5 games`
                        }
                    ]
                }
            });
        }

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
            "layer": layers
        };

        vegaEmbed("#vis", spec);
        outputDiv.innerText = "";

        ///////////////////////////////// Display table totals ////////////////////////////////
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