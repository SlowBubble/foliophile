"use strict";

const STORAGE_KEY = "foliophilia.transactions";
const INITIAL_CASH = 100000;
const realizedGainsBody = document.querySelector("#realized-gains");
const positionsBody = document.querySelector("#positions");
const transactionsBody = document.querySelector("#transactions");
const status = document.querySelector("#status");
const cashBalance = document.querySelector("#cash-balance");
const netWorth = document.querySelector("#net-worth");

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
  renderRealizedGains();
  renderAccountBalances();
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

function dateTimestamp(value) {
  const [, month, day, year] = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function calculateAccountSummary() {
  let cash = INITIAL_CASH;
  let totalCostBasis = 0;
  const costBasisBySymbol = new Map();
  const sharesBySymbol = new Map();
  const firstBuyNetWorthBySymbol = new Map();

  for (const transaction of transactions) {
    const costBasis = costBasisBySymbol.get(transaction.symbol) ?? 0;
    const shares = sharesBySymbol.get(transaction.symbol) ?? 0;
    if (transaction.type === "buy") {
      if (!firstBuyNetWorthBySymbol.has(transaction.symbol)) {
        firstBuyNetWorthBySymbol.set(
          transaction.symbol,
          cash === null ? null : cash + totalCostBasis,
        );
      }

      const purchaseCost = transaction.shares * transaction.price;
      cash = cash === null ? null : cash - purchaseCost;
      totalCostBasis += purchaseCost;
      costBasisBySymbol.set(transaction.symbol, costBasis + purchaseCost);
      sharesBySymbol.set(transaction.symbol, shares + transaction.shares);
      continue;
    }

    const remainingShares = shares - transaction.shares;
    const soldCostBasis =
      remainingShares <= 1e-8
        ? costBasis
        : (costBasis / shares) * transaction.shares;
    totalCostBasis -= soldCostBasis;
    costBasisBySymbol.set(
      transaction.symbol,
      remainingShares <= 1e-8 ? 0 : costBasis - soldCostBasis,
    );
    sharesBySymbol.set(
      transaction.symbol,
      remainingShares <= 1e-8 ? 0 : remainingShares,
    );

    const saleProceeds =
      transaction.amount ?? transaction.price * transaction.shares;
    if (cash !== null) {
      cash =
        Number.isFinite(saleProceeds) && saleProceeds > 0
          ? cash + saleProceeds
          : null;
    }
  }

  return {
    cashBalance: cash,
    netWorth: cash === null ? null : cash + totalCostBasis,
    firstBuyNetWorthBySymbol,
  };
}

function calculateRealizedGains(
  accountSummary = calculateAccountSummary(),
) {
  const results = new Map();

  for (const transaction of transactions) {
    let result = results.get(transaction.symbol);
    if (!result) {
      result = {
        symbol: transaction.symbol,
        shares: 0,
        costBasis: 0,
        realizedCostBasis: 0,
        proceeds: 0,
        hasSales: false,
        hasUnrecordedProceeds: false,
        firstPurchaseDate: null,
        lastSaleDate: null,
      };
      results.set(transaction.symbol, result);
    }

    const timestamp = dateTimestamp(transaction.date);
    if (transaction.type === "buy") {
      result.shares += transaction.shares;
      result.costBasis += transaction.shares * transaction.price;
      if (
        result.firstPurchaseDate === null ||
        timestamp < result.firstPurchaseDate
      ) {
        result.firstPurchaseDate = timestamp;
      }
      continue;
    }

    const averageCost = result.costBasis / result.shares;
    const soldCostBasis = averageCost * transaction.shares;
    result.shares -= transaction.shares;
    result.costBasis -= soldCostBasis;
    result.realizedCostBasis += soldCostBasis;
    result.hasSales = true;
    result.lastSaleDate =
      result.lastSaleDate === null
        ? timestamp
        : Math.max(result.lastSaleDate, timestamp);

    const saleProceeds =
      transaction.amount ?? transaction.price * transaction.shares;
    if (Number.isFinite(saleProceeds) && saleProceeds > 0) {
      result.proceeds += saleProceeds;
    } else {
      result.hasUnrecordedProceeds = true;
    }
  }

  return [...results.values()]
    .filter((result) => result.hasSales)
    .map((result) => {
      const elapsed =
        result.firstPurchaseDate === null || result.lastSaleDate === null
          ? 0
          : result.lastSaleDate - result.firstPurchaseDate;
      const durationYears =
        elapsed > 0 ? elapsed / (365.2425 * 24 * 60 * 60 * 1000) : null;
      const gain = result.proceeds - result.realizedCostBasis;
      const gainRate = gain / result.realizedCostBasis;
      const irr =
        !result.hasUnrecordedProceeds &&
        durationYears !== null &&
        result.realizedCostBasis > 0
          ? (result.proceeds / result.realizedCostBasis) ** (1 / durationYears) -
            1
          : null;

      return {
        symbol: result.symbol,
        durationYears,
        gain: result.hasUnrecordedProceeds ? null : gain,
        gainRate: result.hasUnrecordedProceeds ? null : gainRate,
        irr,
        netWorthRate:
          result.hasUnrecordedProceeds ||
          accountSummary.firstBuyNetWorthBySymbol.get(result.symbol) == null
            ? null
            : gain /
              accountSummary.firstBuyNetWorthBySymbol.get(result.symbol),
      };
    })
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPercentage(value) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

function renderRealizedGains() {
  if (!realizedGainsBody) return;

  const gains = calculateRealizedGains(calculateAccountSummary());
  realizedGainsBody.replaceChildren();

  if (gains.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty-state";
    cell.textContent = "No realized gains yet.";
    row.append(cell);
    realizedGainsBody.append(row);
    return;
  }

  for (const gain of gains) {
    const row = document.createElement("tr");
    const values = [
      gain.symbol,
      gain.durationYears === null
        ? "Not recorded"
        : new Intl.NumberFormat(undefined, {
            maximumFractionDigits: 2,
          }).format(gain.durationYears),
      gain.gain === null ? "Not recorded" : formatCurrency(gain.gain),
      gain.gainRate === null ? "Not recorded" : formatPercentage(gain.gainRate),
      gain.irr === null ? "Not recorded" : formatPercentage(gain.irr),
      gain.netWorthRate === null
        ? "Not recorded"
        : formatPercentage(gain.netWorthRate),
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    realizedGainsBody.append(row);
  }
}

function renderAccountBalances() {
  const accountSummary = calculateAccountSummary();

  if (cashBalance) {
    cashBalance.textContent =
      accountSummary.cashBalance === null
        ? "Cash balance: Not recorded"
        : `Cash balance: ${formatCurrency(accountSummary.cashBalance)}`;
  }
  if (netWorth) {
    netWorth.textContent =
      accountSummary.netWorth === null
        ? "Net worth (positions at cost): Not recorded"
        : `Net worth (positions at cost): ${formatCurrency(accountSummary.netWorth)}`;
  }
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

function updateDraftCalculations(row) {
  const type = row.dataset.type;
  const price = parseNumericField(row.querySelector('input[data-field="price"]')?.value);
  const sharesInput = row.querySelector('input[data-field="shares"]');
  const amountInput = row.querySelector('input[data-field="amount"]');
  const sharesCell = row.querySelector('[data-field="shares"][data-computed="true"]');
  const amountCell = row.querySelector('[data-field="amount"][data-computed="true"]');

  if (type === "buy" && sharesCell) {
    const amount = parseNumericField(amountInput?.value);
    sharesCell.textContent =
      Number.isFinite(price) && price > 0 && Number.isFinite(amount) && amount > 0
        ? String(Math.floor(amount / price))
        : "0";
  } else if (type === "sell" && amountCell) {
    const shares = parseNumericField(sharesInput?.value);
    amountCell.textContent =
      Number.isFinite(price) && price > 0 && Number.isFinite(shares) && shares > 0
        ? String(shares * price)
        : "0";
  }
}

function buildNewTransactionRow(type = "buy", symbol = "") {
  const row = document.createElement("tr");
  row.className = "new-transaction-row";
  row.dataset.type = type;
  const latestPurchase =
    type === "sell"
      ? [...transactions]
          .reverse()
          .find(
            (transaction) =>
              transaction.type === "buy" && transaction.symbol === symbol,
          )
      : undefined;

  const fields = ["type", "symbol", "price", "shares", "amount", "date"];
  for (const key of fields) {
    const cell = document.createElement("td");
    cell.dataset.field = key;
    if (key === "type") {
      cell.textContent = type;
      if (type === "sell") {
        cell.title = "Double-click to switch back to a purchase";
        cell.className = "transaction-type-toggle";
      }
      row.append(cell);
      continue;
    }

    const computed = (type === "buy" && key === "shares") ||
      (type === "sell" && key === "amount");
    if (computed) {
      cell.dataset.computed = "true";
      cell.textContent = "0";
      row.append(cell);
      continue;
    }
    if (type === "buy" && key === "shares") continue;
    if (type === "sell" && key === "amount") continue;

    const input = document.createElement("input");
    input.type = "text";
    input.name = key;
    input.value = key === "symbol" ? symbol : key === "date" ? today() : "";
    if (key === "date") {
      input.placeholder = today();
    } else if (key === "price" && latestPurchase) {
      input.placeholder = String(latestPurchase.price);
    } else if (key === "shares" && latestPurchase) {
      input.placeholder = String(latestPurchase.shares);
    }
    input.dataset.field = key;
    input.setAttribute("aria-label", key);
    cell.append(input);
    row.append(cell);
  }

  const actionCell = document.createElement("td");
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "save-button";
  saveButton.textContent = "Save";
  actionCell.append(saveButton);
  row.append(actionCell);

  row.addEventListener("input", () => updateDraftCalculations(row));
  updateDraftCalculations(row);
  return row;
}

function captureNewTransaction(row) {
  const inputs = row.querySelectorAll("input");
  const candidate = {};
  candidate.type = row.dataset.type;
  for (const input of inputs) {
    const value = input.value.trim();
    candidate[input.dataset.field] = value;
  }

  const normalized = normalizeTransaction(candidate);
  if (normalized.symbol === undefined || normalized.symbol === "") {
    throw new Error("The stock symbol is required.");
  }
  if (!/^[A-Z0-9.^-]{1,15}$/.test(normalized.symbol)) {
    throw new Error("Stock symbol is invalid.");
  }
  if (normalized.price === undefined || !Number.isFinite(normalized.price) || normalized.price <= 0) {
    throw new Error("Price must be a positive number.");
  }
  if (normalized.type === "buy") {
    if (normalized.amount === undefined || !Number.isFinite(normalized.amount) || normalized.amount <= 0) {
      throw new Error("Amount must be a positive number.");
    }
    normalized.shares = Math.floor(normalized.amount / normalized.price);
    if (!Number.isInteger(normalized.shares) || normalized.shares <= 0) {
      throw new Error("The investment amount is not enough to buy one share.");
    }
  } else {
    if (normalized.shares === undefined || !Number.isFinite(normalized.shares) || normalized.shares <= 0) {
      throw new Error("Shares must be a positive number.");
    }
    const position = calculatePositions().find((item) => item.symbol === normalized.symbol);
    if (!position || normalized.shares > position.shares) {
      throw new Error(`Enter a number of shares no more than the ${normalized.symbol} position (${position?.shares ?? 0}).`);
    }
    normalized.amount = normalized.shares * normalized.price;
    if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
      throw new Error("The sale proceeds are too large to record.");
    }
  }
  if (!parseDate(normalized.date)) {
    throw new Error("Date must be in MM-DD-YYYY format.");
  }

  return normalized;
}

function saveNewTransaction(row) {
  try {
    const transaction = captureNewTransaction(row);
    const nextTransactions = [...transactions, transaction];
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
      if (Number.isFinite(next.shares) && next.price > 0) {
        next.amount = next.shares * next.price;
      }
    } else if (field === "amount") {
      const numeric = parseNumericField(value);
      if (numeric === undefined) {
        delete next.amount;
      } else {
        next.amount = numeric;
        if (Number.isFinite(numeric) && next.price > 0) {
          next.shares = next.type === "buy"
            ? Math.floor(numeric / next.price)
            : numeric / next.price;
        }
      }
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
  if (!Number.isInteger(index) || !field) return;

  const transaction = transactions[index];
  if (!transaction) return;

  const currentValue = transaction[field] === undefined ? "" : String(transaction[field]);
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentValue;
  input.dataset.index = String(index);
  input.dataset.field = field;
  input.setAttribute("aria-label", `Edit ${field}`);

  let finished = false;
  const save = () => {
    if (finished) return;
    finished = true;
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
      const numeric = parseNumericField(nextValue);
      if (!Number.isFinite(numeric) || numeric <= 0 || (transaction.type === "buy" && !Number.isInteger(numeric))) {
        setStatus(transaction.type === "buy"
          ? "Shares must be a positive whole number."
          : "Shares must be a positive number.");
        renderTransactions();
        return;
      }
    }

    if (["price", "amount"].includes(field)) {
      const numeric = parseNumericField(nextValue);
      if (nextValue === "" && field === "price") {
        updateTransactionField(index, field, "");
        return;
      }
      if (!Number.isFinite(numeric) || numeric <= 0) {
        setStatus(`${field === "price" ? "Price" : "Amount"} must be a positive number.`);
        renderTransactions();
        return;
      }
      if (field === "amount" && !(transaction.price > 0)) {
        setStatus("A recorded price is required to calculate shares from the amount.");
        renderTransactions();
        return;
      }
    }

    if (field === "shares" && !(transaction.price > 0)) {
      setStatus("A recorded price is required to calculate the amount from shares.");
      renderTransactions();
      return;
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
      finished = true;
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
    const fields = ["type", "symbol", "price", "shares", "amount", "date"];

    for (const field of fields) {
      const cell = document.createElement("td");
      cell.dataset.index = String(index);
      cell.dataset.field = field;
      cell.textContent =
        transaction[field] === undefined ? "Not recorded" : String(transaction[field]);
      cell.className = "transaction-cell";
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
    return row;
  });

  for (const row of rows) {
    transactionsBody.append(row);
  }

  const addRow = buildNewTransactionRow();
  transactionsBody.append(addRow);
}

positionsBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-symbol]");
  if (!button) return;
  const row = buildNewTransactionRow("sell", button.dataset.symbol);
  transactionsBody.querySelector(".new-transaction-row")?.remove();
  transactionsBody.append(row);
  row.querySelector('input[data-field="price"]').focus();
  setStatus("");
});

transactionsBody.addEventListener("click", (event) => {
  const saveButton = event.target.closest(".save-button");
  if (saveButton) {
    const row = saveButton.closest("tr");
    if (row) {
      saveNewTransaction(row);
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
  const sellTypeCell = event.target.closest(
    '.new-transaction-row[data-type="sell"] [data-field="type"]',
  );
  if (sellTypeCell) {
    const row = sellTypeCell.closest(".new-transaction-row");
    if (row) {
      row.replaceWith(buildNewTransactionRow());
      setStatus("");
    }
    return;
  }

  const cell = event.target.closest(".transaction-cell");
  if (cell) {
    startEditingCell(cell);
  }
});

renderRealizedGains();
renderAccountBalances();
renderPositions();
renderTransactions();
