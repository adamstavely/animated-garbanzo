import { Logger } from '@nestjs/common';

/**
 * Failure-path tests deliberately trigger warnings and errors. Silencing Nest's
 * logger keeps the test output readable; the assertions cover the behaviour.
 */
Logger.overrideLogger(false);
