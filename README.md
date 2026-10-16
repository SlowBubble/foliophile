
# m1f
- Double-click the **sell** type cell in the draft row to cancel sale mode and return to a purchase.
# m1e
- When sell button is clicked, just prefill the bottom transaction row with sell, prefilled symbol, editable shares, price, make amount not editable
  - also, let's switch shares and price column
- Let's revert previous change to make shares of existing transactions not editable (rather if a user edit shares, then just modify the amount accordingly and vice versa)

# m1d
- Instead of "Enter ..." button, let just add a row to the bottom of the transactions table with type buy, and action being "Save"

# m1c
- let's ask for price before number shares for both buy and sell

For a purchase, enter the stock symbol, then the stock price, then the investment amount. For a sale, enter the sale price before the number of shares to sell.

# m1b
Have a button that when clicked:
- Display a transaction table of all the transactions
  - Allow editing each individual field in the transaction when I double click on that cell and update the corresponding data in local storage

The complete transaction history is displayed below the positions table. Shares are computed for purchases and cannot be edited; double-click a type, symbol, price, amount, or date cell to edit it. Click outside the field to save or press Escape to cancel. Edits and deletions are validated against the whole transaction history before they are saved, and positions are recalculated after a successful change. Use the **×** button to delete a transaction. A purchase cannot be deleted if a later sale depends on its shares.

Sales recorded by an earlier version before sale prices were collected remain in the ledger and continue to count toward positions. Their missing price or amount fields display as **Not recorded** and can be filled in by editing those cells.

# m1a
I want an html app with a separate js file

- When a user press enter, or have a button for to enter a transaction
    - Prompt for stock symbol (use window.prompt)
    - Prompt stock price
    - Prompt amount you want to buy
    - Prompt for the date (in MM-DD-YYYY and placeholder with today)
    - Round down to the number of shares you buy
    - Save the data in local storage and display the data as a row in the Positions table
- For each row of the Positions table, have a button to press for selling part of the shares
    - Prompt for the stock price
    - Prompt the number of shares you want to sell
    - Prompt for the date (in MM-DD-YYYY and placeholder with today)
    - Save the data in local storage
    - Update the Positions
