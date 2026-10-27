// Pace numeric values (plan Section 6, [Suggested])
const PACE_VALUE = { relaxed: 0.2, moderate: 0.5, fast: 0.8 };

// Day capacity in minutes ([Decided])
const DAY_CAPACITY = { relaxed: 270, moderate: 360, fast: 480 };

// Rough average travel time between places, minutes (city default, adjust after OSRM tests)
const ROUGH_AVG_TRAVEL_MINUTES = 30;

module.exports = { PACE_VALUE, DAY_CAPACITY, ROUGH_AVG_TRAVEL_MINUTES };