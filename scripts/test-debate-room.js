const DebateRoom = require('../backend/models/DebateRoom');
const { loadDebates, saveDebate, findDebateById } = require('../backend/storage/debatesStorage');

async function testDebateRoom() {
  console.log('Testing DebateRoom model and storage...\n');

  try {
    // Test 1: Create a DebateRoom
    console.log('1. Creating a new DebateRoom...');
    const debateRoom = new DebateRoom(
      'test-sector-id',
      'Test Debate',
      ['agent-1', 'agent-2']
    );
    console.log('   Created:', debateRoom.id);
    console.log('   Title:', debateRoom.title);
    console.log('   Status:', debateRoom.status);
    console.log('   Agent IDs:', debateRoom.agentIds);

    // Test 2: Add a message
    console.log('\n2. Adding a message...');
    debateRoom.addMessage({
      agentId: 'agent-1',
      content: 'This is a test message',
      role: 'participant'
    });
    console.log('   Messages count:', debateRoom.messages.length);
    console.log('   Last message:', debateRoom.messages[0]);

    // Test 3: Test toJSON
    console.log('\n3. Testing toJSON()...');
    const jsonData = debateRoom.toJSON();
    console.log('   JSON keys:', Object.keys(jsonData));
    console.log('   Has all required fields:', 
      jsonData.id && jsonData.sectorId && jsonData.title && 
      jsonData.agentIds && jsonData.messages && jsonData.status &&
      jsonData.createdAt && jsonData.updatedAt
    );

    // Test 4: Save to storage
    console.log('\n4. Saving to storage...');
    await saveDebate(debateRoom);
    console.log('   Saved successfully');

    // Test 5: Reload from storage
    console.log('\n5. Reloading from storage...');
    const loadedData = await findDebateById(debateRoom.id);
    if (loadedData) {
      console.log('   Found debate:', loadedData.id);
      console.log('   Title:', loadedData.title);
      console.log('   Messages count:', loadedData.messages.length);
      
      // Test 6: Reconstruct from data
      console.log('\n6. Reconstructing DebateRoom from data...');
      const reconstructed = DebateRoom.fromData(loadedData);
      console.log('   Reconstructed ID:', reconstructed.id);
      console.log('   Reconstructed title:', reconstructed.title);
      console.log('   Reconstructed messages:', reconstructed.messages.length);
      
      // Test 7: Add another message and save again
      console.log('\n7. Adding another message and saving...');
      reconstructed.addMessage({
        agentId: 'agent-2',
        content: 'This is a second message',
        role: 'participant'
      });
      await saveDebate(reconstructed);
      console.log('   Updated and saved successfully');
      
      // Test 8: Verify update
      console.log('\n8. Verifying update...');
      const updatedData = await findDebateById(debateRoom.id);
      console.log('   Updated messages count:', updatedData.messages.length);
      console.log('   Last message agent:', updatedData.messages[updatedData.messages.length - 1].agentId);
      
      console.log('\n✅ All tests passed!');
    } else {
      console.error('   ❌ Failed to load debate from storage');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
testDebateRoom();

