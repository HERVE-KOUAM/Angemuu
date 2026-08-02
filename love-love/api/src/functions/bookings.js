const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const client = TableClient.fromConnectionString(connectionString, 'bookings');

app.http('bookings', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            await client.createTable();
            
            if (request.method === 'POST') {
                const body = await request.json();
                const booking = {
                    partitionKey: 'booking',
                    rowKey: `booking-${Date.now()}`,
                    ...body
                };
                await client.createEntity({ entity: booking });
                return { body: JSON.stringify({ success: true, booking }) };
            } else {
                const bookings = [];
                const entities = client.listEntities();
                for await (const entity of entities) {
                    bookings.push(entity);
                }
                return { body: JSON.stringify(bookings) };
            }
        } catch (error) {
            return { status: 500, body: JSON.stringify({ error: error.message }) };
        }
    }
});
