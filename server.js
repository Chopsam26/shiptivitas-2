import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  return res.status(200).send({ 'message': 'SHIPTIVITY API. Read documentation to see API docs' });
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (Number.isNaN(priority)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid priority provided.',
        'long_message': 'Priority can only be positive integer.',
      },
    };
  }
  return {
    valid: true,
  }
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ?').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No two clients on the same status should have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);

  /* ---------- Update code below ----------*/
  //get client based on id and get its current priority and status
  // if (priority) check if priority has changed
  //if (status) check if status has changed
  //if only priority has changed then change the priority of all clients within the status of client
  //if status has changed and no priority is provided then move the client to the bottom of new status 
  // and modify the clients in old status to pull them up
  // 
  // if  status has changed and priority is provided then move the client to new status with given priority and
  // adjust clients in both old and new statuses accordingly by pulling up in old and pushing down status in new

  // if neither has changed, do nothing
  let statusHasChanged = false;
  let priorityHasChanged = false;
  if (status) {
    if (status !== client.status) statusHasChanged = true;
  }
  if (priority) {
    if (priority !== client.priority) priorityHasChanged = true;
  }
  let stmt = '';
  let updates = '';

  if (priorityHasChanged) {
    //get the client's current priority, call it oldPriority
    let oldPriority = client.priority;

    let moveClient;

    // check if we are moving the client up or down by comparing oldPriority to priority
    if (oldPriority > priority) {
      //if we are moving up we have to add 1 to the priority of all clients that have this priority until we reach oldPriority
      let currentPriority = priority;
      while (currentPriority != oldPriority) {
        //fetch the client currently associated with the new priority into moveClient
        moveClient = clients.find(moveClient => (moveClient.priority === currentPriority) && (moveClient.status === status));
        currentPriority++;
        if (moveClient) {
          stmt = db.prepare("UPDATE clients SET priority = ? WHERE id = ?");
          updates = stmt.run(currentPriority, moveClient.id);
          //console.log("current priority for id " + moveClient.id + "should be " + currentPriority);
        }
      }

    } else {
      //if moving down, we have to subtract 1 to the priority of all clients that have this priority until we reach oldPriority
      let currentPriority = priority;
      while (currentPriority != oldPriority) {
        //fetch the client currently associated with the new priority into moveClient
        moveClient = clients.find(moveClient => (moveClient.priority === currentPriority) && (moveClient.status === status));
        currentPriority--;
        if (moveClient) {
          stmt = db.prepare("UPDATE clients SET priority = ? WHERE id = ?");
          updates = stmt.run(currentPriority, moveClient.id);
         // console.log("-current priority for id " + moveClient.id + "should be " + currentPriority);
        }
      }
    }
    //now move client to priority
    stmt = db.prepare("UPDATE clients SET priority = ? WHERE id = ?");
    updates = stmt.run(priority, client.id);
    //console.log("current priority is " + priority);

  }
  if ((statusHasChanged) && !priority) {
    //if priroity is null it goes to the bottom
    //find the lowest priorty in clients with the same status
    //then add 1 to put the client at the bottom 
    let newPriority = 0;
    let oldStatus = client.status;
    let oldPriority = client.priority;
    let maxPriority = 0;


    for (let i = 0; i < clients.length; i++) {

      if ((clients[i].priority > maxPriority) && (clients[i].status === status)) {
        maxPriority = clients[i].priority;
        //console.log("client[" + i + "] priority and status " + clients[i].priority + ", " + clients[i].status);
        
      }
    }
    newPriority = maxPriority + 1;
    //console.log("this is the new priority " + newPriority);
    //console.log( "this is the max priority " + maxPriority);
    //console.log("status being used " + status);

    stmt = db.prepare("UPDATE clients SET status = ?, priority = ? WHERE id = ?");
    updates = stmt.run(status, newPriority, id);

    //refresh the clients array after a database change 
    clients = db.prepare('select * from clients').all();
    //now pull up the priorities of the clients in the old status
    for (let i = 0; i < clients.length; i++) {

      if ((clients[i].priority > oldPriority) && (clients[i].status === oldStatus)) {
        clients[i].priority -= 1;
        stmt = db.prepare("UPDATE clients SET priority = ? WHERE id = ?");
        updates = stmt.run(clients[i].priority, clients[i].id);
        //console.log("client[" + i + "] priority and status " + clients[i].priority + ", " + clients[i].status);
      }
    }
  }

  if ((statusHasChanged) && priority) {
    //move client to new status, push down clients in new status, pull up clients in old status
    let newPriority = 0;
    let oldStatus = client.status;
    let oldPriority = client.priority;
    client.status = status;
    let maxPriority = 0;
    //make room in new status by pushing down clients in new status
    for (let i = 0; i < clients.length; i++) {
      if ((clients[i].priority >= priority) && (clients[i].status === status)) {
        clients[i].priority += 1;
        stmt = db.prepare("UPDATE clients SET priority = ? WHERE id = ?");
        updates = stmt.run(clients[i].priority, clients[i].id);
        
      }
    }
    //now move the client to the new status with the given priority
    stmt = db.prepare("UPDATE clients SET status = ?, priority = ? WHERE id = ?");
    updates = stmt.run(status, priority, id);
    //refresh the clients array after a database change 
    clients = db.prepare('select * from clients').all();
    //now pull up the priorities of the clients in the old status
    for (let i = 0; i < clients.length; i++) {
      if ((clients[i].priority > oldPriority) && (clients[i].status === oldStatus)) {
        clients[i].priority -= 1;
        stmt = db.prepare("UPDATE clients SET priority = ? WHERE id = ?");
        updates = stmt.run(clients[i].priority, clients[i].id);
      }
    }
  }
  clients = db.prepare('select * from clients').all();
  return res.status(200).send(clients);
});

app.listen(3001);
console.log('app running on port ', 3001);
