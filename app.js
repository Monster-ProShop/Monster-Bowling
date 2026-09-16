document.addEventListener('DOMContentLoaded', () => {
    
    const hdcpBuyInInput = document.getElementById('hdcpBuyIn');
    const hdcpFirstDisplay = document.getElementById('hdcpFirst');
    const hdcpSecondDisplay = document.getElementById('hdcpSecond');

    // Utility function: Rounds a number to the nearest multiple of 5
    function roundToNearestFive(num) {
        return Math.round(num / 5) * 5;
    }

    // Calculates and updates the bracket payouts based on rules
    function updatePayouts() {
        const buyIn = parseFloat(hdcpBuyInInput.value) || 0;
        
        // Bracket of 8
        const totalPool = buyIn * 8; 

        // 62.5% for 1st, 25% for 2nd
        const rawFirstPlace = totalPool * 0.625;
        const rawSecondPlace = totalPool * 0.25;

        // Round to nearest $5 multiple
        const finalFirstPlace = roundToNearestFive(rawFirstPlace);
        const finalSecondPlace = roundToNearestFive(rawSecondPlace);

        hdcpFirstDisplay.textContent = `$${finalFirstPlace.toFixed(2)}`;
        hdcpSecondDisplay.textContent = `$${finalSecondPlace.toFixed(2)}`;
    }

    // Listen for changes on the buy-in input
    hdcpBuyInInput.addEventListener('input', updatePayouts);

    // Initial calculation on load
    updatePayouts();

    // Prevent default form submission for now
    document.getElementById('registrationForm').addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Registration data ready to be sent to backend/database!');
    });
});