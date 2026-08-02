const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const client = TableClient.fromConnectionString(connectionString, 'bookings');

app.http('saveBooking', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            await client.createTable();
            const body = await request.json();
            const booking = {
                partitionKey: 'booking',
                rowKey: `booking-${Date.now()}`,
                ...body
            };
            await client.createEntity({ entity: booking });
            return { body: JSON.stringify({ success: true, booking }) };
        } catch (error) {
            return { status: 500, body: JSON.stringify({ error: error.message }) };
        }
    }
});
