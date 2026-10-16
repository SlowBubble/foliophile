"use strict";

const STORAGE_KEY = "foliophilia.transactions";
const positionsBody = document.querySelector("#positions");
const transactionsBody = document.querySelector("#transactions");
const status = document.querySelector("#status");

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

function persistTransactions(nextTransactions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTransactions));
  transactions = nextTransactions;
  renderPositions();
  renderTransactions();
}

function setStatus(message) {
  status.textContent = message || "";
}

let transactions;
try {
  transactions = loadTransactions();
} catch (error) {
  transactions = [];
  setStatus(
    error instanceof SyntaxError
      ? "Saved transaction data could not be read. Please check browser storage."
      : `Could not load saved transactions: ${error.message}`,
  );
}

function appendTransaction(transaction) {
  const nextTransactions = [...transactions, transaction];
  validateTransactions(nextTransactions);
  persistTransactions(nextTransactions);
  setStatus("");
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
  if (!positionsBody) return;

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

function parseNumericField(value) {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeTransaction(input) {
  const next = { ...input };
  if (typeof next.symbol === "string") {
    next.symbol = next.symbol.trim().toUpperCase();
  }
  if (typeof next.type === "string") {
    next.type = next.type.trim().toLowerCase();
  }

  if (Object.prototype.hasOwnProperty.call(next, "shares")) {
    next.shares = parseNumericField(next.shares);
  }
  if (Object.prototype.hasOwnProperty.call(next, "price")) {
    next.price = parseNumericField(next.price);
    if (next.price === undefined) delete next.price;
  }
  if (Object.prototype.hasOwnProperty.call(next, "amount")) {
    next.amount = parseNumericField(next.amount);
    if (next.amount === undefined) delete next.amount;
  }
  return next;
}

function updateComputedShares(row) {
  const priceInput = row.querySelector('input[data-field="price"]');
  const amountInput = row.querySelector('input[data-field="amount"]');
  const sharesCell = row.querySelector('[data-field="shares"][data-computed="true"]');

  if (!priceInput || !amountInput || !sharesCell) return;

  const price = parseNumericField(priceInput.value);
  const amount = parseNumericField(amountInput.value);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(amount) || amount <= 0) {
    sharesCell.textContent = "0";
    return;
  }

  const shares = Math.floor(amount / price);
  sharesCell.textContent = String(shares);
}

function buildNewPurchaseRow() {
  const row = document.createElement("tr");
  row.className = "new-transaction-row";

  const fields = [
    { key: "type", value: "buy", readOnly: true },
    { key: "symbol", value: "" },
    { key: "price", value: "" },
    { key: "amount", value: "" },
    { key: "date", value: today(), placeholder: today() },
  ];

  for (const field of fields) {
    const cell = document.createElement("td");
    if (field.key === "type") {
      cell.textContent = field.value;
      cell.dataset.field = field.key;
      row.append(cell);
      continue;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.name = field.key;
    input.value = field.value;
    if (field.placeholder) {
      input.placeholder = field.placeholder;
    }
    input.dataset.field = field.key;
    input.setAttribute("aria-label", field.key);
    cell.append(input);
    row.append(cell);
  }

  const sharesCell = document.createElement("td");
  sharesCell.dataset.field = "shares";
  sharesCell.dataset.computed = "true";
  sharesCell.textContent = "0";
  row.insertBefore(sharesCell, row.children[2]);

  const actionCell = document.createElement("td");
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "save-button";
  saveButton.textContent = "Save";
  actionCell.append(saveButton);
  row.append(actionCell);

  updateComputedShares(row);
  row.querySelector('input[data-field="price"]').addEventListener("input", () => updateComputedShares(row));
  row.querySelector('input[data-field="amount"]').addEventListener("input", () => updateComputedShares(row));
  return row;
}

function captureNewPurchase(row) {
  const inputs = row.querySelectorAll("input");
  const candidate = {};
  candidate.type = "buy";
  for (const input of inputs) {
    const value = input.value.trim();
    candidate[input.dataset.field] = value;
  }

  const normalized = normalizeTransaction(candidate);
  if (normalized.symbol === undefined || normalized.symbol === "") {
    throw new Error("The stock symbol is required.");
  }
  if (normalized.price === undefined || !Number.isFinite(normalized.price) || normalized.price <= 0) {
    throw new Error("Price must be a positive number.");
  }
  if (normalized.amount === undefined || !Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  normalized.shares = Math.floor(normalized.amount / normalized.price);
  if (!Number.isInteger(normalized.shares) || normalized.shares <= 0) {
    throw new Error("The investment amount is not enough to buy one share.");
  }
  if (!parseDate(normalized.date)) {
    throw new Error("Date must be in MM-DD-YYYY format.");
  }

  return normalized;
}

function saveNewPurchase(row) {
  try {
    const purchase = captureNewPurchase(row);
    const nextTransactions = [...transactions, purchase];
    validateTransactions(nextTransactions);
    persistTransactions(nextTransactions);
    setStatus("");
  } catch (error) {
    setStatus(error.message);
  }
}

function cloneWithFieldValue(index, field, value) {
  const nextTransactions = transactions.map((transaction, transactionIndex) => {
    if (transactionIndex !== index) return transaction;

    const next = { ...transaction };
    if (value === "") {
      if (field === "symbol") {
        next.symbol = "";
      } else if (field === "type") {
        next.type = "buy";
      } else if (field === "date") {
        next.date = today();
      } else if (["price", "amount"].includes(field)) {
        delete next[field];
      } else {
        next[field] = undefined;
      }
      return next;
    }

    if (field === "type") {
      next.type = String(value).trim().toLowerCase();
    } else if (field === "symbol") {
      next.symbol = String(value).trim().toUpperCase();
    } else if (field === "date") {
      next.date = String(value).trim();
    } else if (field === "shares") {
      next.shares = Number(String(value).trim());
    } else {
      const numeric = parseNumericField(value);
      if (numeric === undefined) {
        delete next[field];
      } else {
        next[field] = numeric;
      }
    }

    return next;
  });

  return nextTransactions;
}

function updateTransactionField(index, field, rawValue) {
  const nextTransactions = cloneWithFieldValue(index, field, rawValue);
  try {
    validateTransactions(nextTransactions);
    persistTransactions(nextTransactions);
    setStatus("");
  } catch (error) {
    setStatus(error.message);
    renderTransactions();
  }
}

function deleteTransaction(index) {
  const nextTransactions = transactions.filter((_, transactionIndex) => transactionIndex !== index);
  try {
    validateTransactions(nextTransactions);
    persistTransactions(nextTransactions);
    setStatus("");
  } catch (error) {
    setStatus(error.message);
  }
}

function startEditingCell(cell) {
  const index = Number(cell.dataset.index);
  const field = cell.dataset.field;
  if (!Number.isInteger(index) || !field || field === "shares") return;

  const transaction = transactions[index];
  if (!transaction) return;

  const currentValue = transaction[field] === undefined ? "" : String(transaction[field]);
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentValue;
  input.dataset.index = String(index);
  input.dataset.field = field;
  input.setAttribute("aria-label", `Edit ${field}`);

  const save = () => {
    const nextValue = input.value;
    if (field === "type") {
      const normalized = String(nextValue).trim().toLowerCase();
      if (!/^(buy|sell)$/.test(normalized)) {
        setStatus("Type must be buy or sell.");
        renderTransactions();
        return;
      }
    }

    if (field === "symbol") {
      const symbol = String(nextValue).trim().toUpperCase();
      if (!/^[A-Z0-9.^-]{1,15}$/.test(symbol)) {
        setStatus("Stock symbol is invalid.");
        renderTransactions();
        return;
      }
    }

    if (field === "shares") {
      const numeric = Number(String(nextValue).trim());
      if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
        setStatus("Shares must be a positive whole number.");
        renderTransactions();
        return;
      }
    }

    if (["price", "amount"].includes(field)) {
      const numeric = parseNumericField(nextValue);
      if (nextValue === "" && field !== "amount") {
        updateTransactionField(index, field, "");
        return;
      }
      if (!Number.isFinite(numeric) || numeric <= 0) {
        setStatus("Price and amount must be positive numbers.");
        renderTransactions();
        return;
      }
    }

    if (field === "date") {
      if (!parseDate(String(nextValue).trim())) {
        setStatus("Date must be in MM-DD-YYYY format.");
        renderTransactions();
        return;
      }
    }

    updateTransactionField(index, field, nextValue);
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      renderTransactions();
    }
  });

  input.addEventListener("blur", () => {
    save();
  }, { once: true });

  cell.replaceChildren(input);
  input.focus();
  input.select();
}

function renderTransactions() {
  if (!transactionsBody) return;

  transactionsBody.replaceChildren();

  const rows = transactions.map((transaction, index) => {
    const row = document.createElement("tr");
    const fields = ["type", "symbol", "shares", "price", "amount", "date"];

    for (const field of fields) {
      const cell = document.createElement("td");
      cell.dataset.index = String(index);
      cell.dataset.field = field;
      cell.textContent =
        transaction[field] === undefined ? "Not recorded" : String(transaction[field]);
      if (field !== "shares") {
        cell.className = "transaction-cell";
        cell.title = "Double-click to edit";
      }
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
    return row;
  });

  for (const row of rows) {
    transactionsBody.append(row);
  }

  const addRow = buildNewPurchaseRow();
  transactionsBody.append(addRow);
}

transactionsBody.addEventListener("click", (event) => {
  const saveButton = event.target.closest(".save-button");
  if (saveButton) {
    const row = saveButton.closest("tr");
    if (row) {
      saveNewPurchase(row);
    }
    return;
  }

  const deleteButton = event.target.closest(".delete-button");
  if (deleteButton) {
    const index = Number(deleteButton.dataset.index);
    if (Number.isInteger(index)) {
      deleteTransaction(index);
    }
  }
});

transactionsBody.addEventListener("dblclick", (event) => {
  const cell = event.target.closest(".transaction-cell");
  if (cell) {
    startEditingCell(cell);
  }
});

renderPositions();
renderTransactions();
