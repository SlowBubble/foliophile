"use strict";

const STORAGE_KEY = "foliophilia.transactions";
const positionsBody = document.querySelector("#positions");
const transactionsBody = document.querySelector("#transactions");
const status = document.querySelector("#status");
const buyForm = document.querySelector("#buy-form");

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}-${date.getFullYear()}`;
}

function parseDate(value) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return null;

  const [, month, day, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return value;
}

function loadTransactions() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) return [];
  return validateTransactions(JSON.parse(saved));
}

function validateTransactions(transactions) {
  if (!Array.isArray(transactions)) {
    throw new Error("Saved transaction data is invalid.");
  }

  const sharesBySymbol = new Map();
  for (const transaction of transactions) {
    if (
      !transaction ||
      !["buy", "sell"].includes(transaction.type) ||
      typeof transaction.symbol !== "string" ||
      !/^[A-Z0-9.^-]{1,15}$/.test(transaction.symbol) ||
      typeof transaction.shares !== "number" ||
      !Number.isFinite(transaction.shares) ||
      transaction.shares <= 0 ||
      !parseDate(transaction.date)
    ) {
      throw new Error("Saved transaction data is invalid.");
    }

    const currentShares = sharesBySymbol.get(transaction.symbol) ?? 0;
    if (transaction.type === "buy") {
      if (
        !Number.isInteger(transaction.shares) ||
        typeof transaction.amount !== "number" ||
        !Number.isFinite(transaction.amount) ||
        transaction.amount <= 0 ||
        typeof transaction.price !== "number" ||
        !Number.isFinite(transaction.price) ||
        transaction.price <= 0
      ) {
        throw new Error("Saved purchase data is invalid.");
      }
      sharesBySymbol.set(
        transaction.symbol,
        currentShares + transaction.shares,
      );
    } else {
      if (transaction.shares > currentShares) {
        throw new Error("Saved sales exceed the shares that were purchased.");
      }
      const hasPrice = transaction.price !== undefined;
      const hasAmount = transaction.amount !== undefined;
      if (
        (hasPrice &&
          (typeof transaction.price !== "number" ||
            !Number.isFinite(transaction.price) ||
            transaction.price <= 0)) ||
        (hasAmount &&
          (typeof transaction.amount !== "number" ||
            !Number.isFinite(transaction.amount) ||
            transaction.amount <= 0))
      ) {
        throw new Error("Saved sale data is invalid.");
      }
      sharesBySymbol.set(
        transaction.symbol,
        Math.max(0, currentShares - transaction.shares),
      );
    }
  }
  return transactions;
}

let transactions;
try {
  transactions = loadTransactions();
} catch (error) {
  transactions = [];
  status.textContent =
    error instanceof SyntaxError
      ? "Saved transaction data could not be read. Please check browser storage."
      : `Could not load saved transactions: ${error.message}`;
  buyForm.querySelector("button").disabled = true;
}

function appendTransaction(transaction) {
  const nextTransactions = [...transactions, transaction];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTransactions));
  transactions = nextTransactions;
  status.textContent = "";
  renderPositions();
  renderTransactions();
}

function calculatePositions() {
  const positions = new Map();

  for (const transaction of transactions) {
    let position = positions.get(transaction.symbol);
    if (!position) {
      position = { symbol: transaction.symbol, shares: 0, costBasis: 0 };
      positions.set(transaction.symbol, position);
    }

    if (transaction.type === "buy") {
      position.shares += transaction.shares;
      position.costBasis += transaction.shares * transaction.price;
    } else {
      const averageCost = position.costBasis / position.shares;
      position.shares -= transaction.shares;
      position.costBasis -= averageCost * transaction.shares;
      if (position.shares <= 1e-8) {
        position.shares = 0;
        position.costBasis = 0;
      }
    }
  }

  return [...positions.values()]
    .filter((position) => position.shares > 0)
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function renderPositions() {
  const positions = calculatePositions();
  positionsBody.replaceChildren();

  if (positions.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "empty-state";
    cell.textContent = "No open positions yet.";
    row.append(cell);
    positionsBody.append(row);
    return;
  }

  for (const position of positions) {
    const row = document.createElement("tr");
    const values = [
      position.symbol,
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(
        position.shares,
      ),
      formatCurrency(position.costBasis),
      formatCurrency(position.costBasis / position.shares),
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }

    const actionCell = document.createElement("td");
    const sellButton = document.createElement("button");
    sellButton.type = "button";
    sellButton.className = "sell-button";
    sellButton.dataset.symbol = position.symbol;
    sellButton.textContent = "Sell";
    sellButton.setAttribute("aria-label", `Sell ${position.symbol}`);
    actionCell.append(sellButton);
    row.append(actionCell);
    positionsBody.append(row);
  }
}

function renderTransactions() {
  if (!transactionsBody) return;

  transactionsBody.replaceChildren();
  if (transactions.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "empty-state";
    cell.textContent = "No transactions yet.";
    row.append(cell);
    transactionsBody.append(row);
    return;
  }

  const fields = ["type", "symbol", "shares", "price", "amount", "date"];
  for (const [index, transaction] of transactions.entries()) {
    const row = document.createElement("tr");
    for (const field of fields) {
      const cell = document.createElement("td");
      cell.className = "transaction-cell";
      cell.dataset.index = String(index);
      cell.dataset.field = field;
      cell.textContent =
        transaction[field] === undefined
          ? "Not recorded"
          : String(transaction[field]);
      cell.title = "Double-click to edit";
      row.append(cell);
    }

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.dataset.index = String(index);
    deleteButton.textContent = "×";
    deleteButton.setAttribute(
      "aria-label",
      `Delete ${transaction.type} transaction for ${transaction.symbol}`,
    );
    actionCell.append(deleteButton);
    row.append(actionCell);
    transactionsBody.append(row);
  }
}

function deleteTransaction(index) {
  const nextTransactions = transactions.filter(
    (_transaction, transactionIndex) => transactionIndex !== index,
  );
  validateTransactions(nextTransactions);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTransactions));
  transactions = nextTransactions;
  status.textContent = "";
  renderPositions();
  renderTransactions();
}

function saveTransactionEdit(index, field, rawValue) {
  const value =
    field === "type" || field === "symbol" || field === "date"
      ? rawValue.trim()
      : Number(rawValue);
  const transaction = { ...transactions[index] };
  transaction[field] = field === "symbol" ? value.toUpperCase() : value;
  const nextTransactions = transactions.map((entry, entryIndex) =>
    entryIndex === index ? transaction : entry,
  );

  validateTransactions(nextTransactions);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTransactions));
  transactions = nextTransactions;
  status.textContent = "";
  renderPositions();
  renderTransactions();
}

function editTransactionCell(cell) {
  if (!cell || cell.querySelector("input")) return;

  const index = Number(cell.dataset.index);
  const field = cell.dataset.field;
  if (!Number.isInteger(index) || !transactions[index] || !field) return;

  const originalValue = transactions[index][field];
  const input = document.createElement("input");
  input.type = "text";
  input.value = String(originalValue);
  input.setAttribute("aria-label", `Edit transaction ${field}`);
  if (field === "shares" || field === "price" || field === "amount") {
    input.inputMode = "decimal";
  }

  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;

    if (!save) {
      renderTransactions();
      return;
    }

    try {
      saveTransactionEdit(index, field, input.value);
    } catch (error) {
      status.textContent = `Could not update transaction: ${error.message}`;
      renderTransactions();
    }
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
  cell.replaceChildren(input);
  input.focus();
  input.select();
}

function promptForDate() {
  const value = window.prompt(
    "Enter the transaction date (MM-DD-YYYY):",
    today(),
  );
  if (value === null) return null;

  const date = parseDate(value.trim());
  if (!date) {
    status.textContent = "Enter a valid date in MM-DD-YYYY format.";
    return null;
  }
  return date;
}

buyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  status.textContent = "";

  const rawSymbol = window.prompt("Enter the stock symbol:");
  if (rawSymbol === null) return;
  const symbol = rawSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9.^-]{1,15}$/.test(symbol)) {
    status.textContent = "Enter a valid stock symbol.";
    return;
  }

  const amountInput = window.prompt("Enter the amount you want to invest:");
  if (amountInput === null) return;
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    status.textContent = "The investment amount must be greater than zero.";
    return;
  }

  const priceInput = window.prompt("Enter the stock price:");
  if (priceInput === null) return;
  const price = Number(priceInput);
  if (!Number.isFinite(price) || price <= 0) {
    status.textContent = "The stock price must be greater than zero.";
    return;
  }

  const shares = Math.floor(amount / price);
  if (shares < 1) {
    status.textContent = "The investment amount is not enough to buy one share.";
    return;
  }

  const date = promptForDate();
  if (!date) return;

  try {
    appendTransaction({ type: "buy", symbol, amount, price, shares, date });
  } catch (error) {
    status.textContent = `Could not save the purchase: ${error.message}`;
  }
});

positionsBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-symbol]");
  if (!button) return;
  status.textContent = "";

  const symbol = button.dataset.symbol;
  const position = calculatePositions().find((item) => item.symbol === symbol);
  if (!position) return;

  const sharesInput = window.prompt(
    `How many ${symbol} shares do you want to sell? (You own ${position.shares})`,
  );
  if (sharesInput === null) return;
  const shares = Number(sharesInput);
  if (
    !Number.isFinite(shares) ||
    shares <= 0 ||
    shares > position.shares
  ) {
    status.textContent = `Enter a number greater than zero and no more than ${position.shares}.`;
    return;
  }

  const priceInput = window.prompt(`Enter the sale price per ${symbol} share:`);
  if (priceInput === null) return;
  const price = Number(priceInput);
  if (!Number.isFinite(price) || price <= 0) {
    status.textContent = "The stock price must be greater than zero.";
    return;
  }
  const amount = shares * price;
  if (!Number.isFinite(amount)) {
    status.textContent = "The sale proceeds are too large to record.";
    return;
  }

  const date = promptForDate();
  if (!date) return;

  try {
    appendTransaction({
      type: "sell",
      symbol,
      shares,
      price,
      amount,
      date,
    });
  } catch (error) {
    status.textContent = `Could not save the sale: ${error.message}`;
  }
});

transactionsBody.addEventListener("dblclick", (event) => {
  const cell = event.target.closest("td[data-index][data-field]");
  if (cell) editTransactionCell(cell);
});

transactionsBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-index]");
  if (!button) return;

  try {
    deleteTransaction(Number(button.dataset.index));
  } catch (error) {
    status.textContent = `Could not delete transaction: ${error.message}`;
  }
});

renderPositions();
renderTransactions();
