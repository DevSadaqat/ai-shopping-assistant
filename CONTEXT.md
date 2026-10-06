# Shopping Assistant

A chat assistant for a hardware and home-improvement store. It routes each customer message by intent and answers from the store's catalog, guides and stock data.

## Language

### Conversation

**Turn**:
One customer message and the assistant's single reply to it.
_Avoid_: Request, exchange, round

**Intent**:
The kind of help a customer message asks for: product search, project kit, how-to, stock check, safety escalation, clarify, or off-topic.
_Avoid_: Category, route, type

**Reply plan**:
The decision a turn produces about how to answer: either a fixed reply, or instructions for a generated reply (prompt, model tier, and any cards to show after the text).
_Avoid_: Reply, response, plan

**Fixed reply**:
A reply whose exact wording is decided without a model, such as a refusal, an off-topic redirect, or a question asking which project the customer means.
_Avoid_: Canned response, static message

**Model tier**:
Whether a generated reply needs the premium model or the light one; low-value replies (a single clarifying question, a "broaden your search" nudge) get the light tier.
_Avoid_: Model size

**Path**:
The name of the branch of a turn that produced the reply, as recorded in traces.
_Avoid_: Route, flow

### Safety

**Rule refusal**:
A fixed reply sent when a customer message matches a licensed-trade rule; the router is never consulted.

**Soft refusal**:
A fixed reply sent when the router flags licensed-trade work that no rule matched, at any confidence.

### Catalog

**Catalog**:
The store's full set of products with prices, ratings, features and stock flags.

**Project kit**:
A bundle of complementary products for one supported project (painting, garden bed, bathroom fixtures), chosen to fit the customer's total budget.
_Avoid_: Bundle, basket

**Guide**:
A how-to article whose excerpts ground the assistant's answers to how-to questions.
_Avoid_: Doc, article
