/**
 * Test runner for discussion invariant tests
 * 
 * This script runs all invariant tests and exits with a non-zero code
 * if any violations are found. This is designed to block merges in CI/CD.
 */

const { runInvariantTestsOnAllDiscussions } = require('./discussionInvariants.test');

async function main() {
  console.log('='.repeat(80));
  console.log('Running Discussion Invariant Tests');
  console.log('='.repeat(80));
  console.log('');

  try {
    const result = await runInvariantTestsOnAllDiscussions();

    console.log('');
    console.log('='.repeat(80));
    console.log('Test Results Summary');
    console.log('='.repeat(80));
    console.log('');

    if (result.valid) {
      console.log('✅ All invariant tests passed!');
      console.log(`   Validated ${result.discussionResults.length} discussion(s)`);
      console.log('');
      process.exit(0);
    } else {
      console.log('❌ Invariant violations detected!');
      console.log('');
      console.log(`   Total violations: ${result.violations.length}`);
      console.log(`   Discussions with violations: ${result.discussionResults.filter(r => !r.valid).length}`);
      console.log('');

      // Group violations by discussion
      const violationsByDiscussion = new Map();
      for (const discussionResult of result.discussionResults) {
        if (!discussionResult.valid && discussionResult.violations.length > 0) {
          violationsByDiscussion.set(discussionResult.discussionId, discussionResult.violations);
        }
      }

      // Print violations by discussion
      if (violationsByDiscussion.size > 0) {
        console.log('Violations by Discussion:');
        console.log('');
        for (const [discussionId, violations] of violationsByDiscussion) {
          console.log(`  Discussion ${discussionId}:`);
          for (const violation of violations) {
            console.log(`    - ${violation}`);
          }
          console.log('');
        }
      }

      // Print all violations
      if (result.violations.length > 0) {
        console.log('All Violations:');
        console.log('');
        for (const violation of result.violations) {
          console.log(`  ${violation}`);
        }
        console.log('');
      }

      console.log('='.repeat(80));
      console.log('❌ Tests failed - blocking merge');
      console.log('='.repeat(80));
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('Error running invariant tests');
    console.error('='.repeat(80));
    console.error('');
    console.error(error.message);
    console.error(error.stack);
    console.error('');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };

