#  Game Economy A/B Testing Simulator

https://github.com/user-attachments/assets/0d01d952-1064-4fed-8146-727e66fa2ec6

A browser-based live-service economy simulation platform built with **React** and **Vite** that allows designers and analysts to model, test, and compare virtual game economy configurations across a simulated multiplayer ecosystem.

The simulator provides interactive controls for balancing economy variables such as:
- loot drop rates
- fuel costs
- operational sinks
- progression pacing
- player income
- crafting/resource generation
- player archetype behavior

and visualizes their impact through comparative A/B testing dashboards.

---

#  Project Goal

Modern live-service games rely heavily on stable virtual economies.

Small balancing changes can unintentionally:
- inflate item values
- destabilize progression loops
- increase churn
- distort wealth distribution
- reward low-engagement playstyles

This project was built to simulate those outcomes before hypothetical deployment to live servers.

The simulator focuses on:
- economy balancing
- retention analysis
- player behavior modeling
- inflation monitoring
- systems experimentation
- comparative A/B testing

---

#  Simulation Features

## Configurable Economy Variables

The simulator allows real-time adjustment of variables including:

- Rare loot drop rates
- Fuel prices
- Daily operational costs
- Crafting/resource generation
- PvE reward scaling
- Player income rates
- Economy sinks
- Simulation duration
- Active player population

---

## A/B Testing Framework

Two economy variants can be tested simultaneously:

- **Control Variant**
- **Experimental Variant**

The dashboard compares how balancing changes affect:
- player retention
- average credits
- gear progression
- economy stability
- item pricing
- churn rates
- archetype behavior

---

#  Dashboard Modules

## Overview Dashboard
High-level economy health comparison between both variants.

---

## Economy Metrics
Tracks:
- average credits over time
- item market pricing
- gear progression
- inflation behavior
- operational cost scaling

---

## Archetype Analysis
Simulates different player groups including:
- Casual players
- PvP-focused players
- Hardcore grinders

and measures how economy changes affect each archetype differently.

---

## Head-to-Head Comparison
Direct side-by-side comparison of:
- retention
- credits
- player ownership
- gear score
- item pricing
- active population

---

#  Sample Findings

- Increasing loot supply improved short-term retention
- Hardcore archetypes suffered higher churn under inflated economies
- Low operational-cost players accumulated disproportionate wealth
- Excessive item generation destabilized market pricing

---

# ⚙️ Simulation Engine

The project uses a fully client-side simulation engine written in vanilla JavaScript.

Core systems include:
- dynamic economy balancing
- simulated player spending behavior
- economy faucets and sinks
- item value calculation
- wealth distribution modeling
- retention/churn simulation

All calculations are processed in-browser with real-time dashboard updates.

---

# 🛠️ Tech Stack

## Frontend
- React.js
- Vite
- Tailwind CSS

## Visualization
- Interactive chart components
- Dynamic dashboard UI
- Real-time comparative analytics

## Simulation
- Vanilla JavaScript simulation engine
- Client-side economy modeling
- Adjustable balancing systems

---

# Local Setup

## Clone Repository

```bash
git clone https://github.com/KiskuAryan/game-economy-ab-testing.git
```

## Install Dependencies

```bash
npm install
```

## Start Development Server

```bash
npm run dev
```

---

#  Skills Demonstrated

- Game economy balancing
- Systems design thinking
- A/B testing methodology
- Data visualization
- Live-service analytics
- Retention analysis
- Simulation architecture
- Interactive dashboard design

---
