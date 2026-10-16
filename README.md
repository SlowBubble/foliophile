
# m1b
Have a button that when clicked:
- Display a transaction table of all the transactions
  - Allow editing each individual field in the transaction when I double click on that cell and update the corresponding data in local storage

The complete transaction history is displayed below the positions table. Double-click a type, symbol, shares, price, amount, or date cell to edit it; press Enter to save or Escape to cancel. Edits and deletions are validated against the whole transaction history before they are saved, and positions are recalculated after a successful change. Use the **×** button to delete a transaction. A purchase cannot be deleted if a later sale depends on its shares.

Sales recorded by an earlier version before sale prices were collected remain in the ledger and continue to count toward positions. Their missing price or amount fields display as **Not recorded** and can be filled in by editing those cells.

# m1a
I want an html app with a separate js file

- When a user press enter, or have a button for to enter a transaction
    - Prompt for stock symbol (use window.prompt)
    - Prompt amount you want to buy
    - Prompt stock price
    - Prompt for the date (in MM-DD-YYYY and placeholder with today)
    - Round down to the number of shares you buy
    - Save the data in local storage and display the data as a row in the Positions table
- For each row of the Positions table, have a button to press for selling part of the shares
    - Prompt the number of shares you want to sell
    - Prompt for the stock price
    - Prompt for the date (in MM-DD-YYYY and placeholder with today)
    - Save the data in local storage
    - Update the Positions
