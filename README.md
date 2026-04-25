# 🏗️ JobOps: Automated Outreach & Career System

**JobOps** is a full-stack job acquisition system designed to turn the passive act of "tracking" into the active habit of **executing**. It replaces messy spreadsheets with a high-performance workflow engine that manages the entire lifecycle of a job application.

---

## 🚀 Why this project is different
Most job trackers are just CRUD apps. **JobOps** is a system built with logic-driven features to increase interview rates:

* **One-Click Execution:** Integrated with the **SendGrid Mail API** to send outreach and follow-up emails directly from the dashboard.
* **Behavioral Pressure:** A custom **Streak System** algorithm that tracks daily application consistency to prevent "slacking."
* **Automated Scheduling:** A backend "Follow-up Engine" that calculates and sets next-action dates based on user interaction.
* **Decision Analytics:** Real-time calculation of **Response Rates** and **Action Priorities** to help developers pivot their strategy.

---

## 🛠️ The Tech Stack
* **Frontend:** React.js (State management & Derived data filtering)
* **Backend:** Node.js & Express (RESTful API & Email Service)
* **Database:** MongoDB (Mongoose ODM for relational modeling)
* **Third-Party API:** SendGrid (SMTP Automation)
* **Deployment:** Vercel (Frontend) & Render (Backend)

---

## 🧠 Engineering Highlights

### 1. The State-Machine Workflow
The system doesn't just store data; it manages states. Transitions from `Applied` → `Interview` → `Offer` trigger different logic in the analytics and follow-up engine.

### 2. Date Comparison Logic
Handled timezone-resilient date comparisons by stripping time-bits to ensure "Follow-up Due" warnings are accurate across different browser locales.

### 3. Streak Algorithm
Implemented a `Set`-based lookup algorithm to iterate through historical application timestamps and calculate consecutive active days with $O(n)$ efficiency.

---

## 📸 Screenshots
*(Add your screenshots here after deployment)*
* *Main Dashboard with Streak & Stats*
* *Action Required section with the Email Trigger*
* *The "Add Application" flow*

---

## ⚙️ Installation & Setup

### 1. Setup Backend
1.  Navigate to `/server`
2.  Run `npm install`
3.  Create a `.env` file with:
    ```env
    MONGO_URI=your_mongodb_uri
    SENDGRID_API_KEY=your_key
    EMAIL_FROM=your_verified_email
    ```
4.  Run `npm start`

### 2. Setup Frontend
1.  Navigate to `/client`
2.  Run `npm install`
3.  Run `npm start`

---

## 👨‍💻 Author
**RishiKhanth** *Full-Stack Developer*