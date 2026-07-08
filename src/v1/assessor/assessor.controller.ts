import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AssessorService } from './assessor.service.js';
import {
  type CreateAssessorDto,
  assessorDtoSchema,
} from './dto/create-assessor.dto.js';
import { ApiKeyGuard } from '../../auth/api-key.guard.js';
import { ImageValidationPipe } from '../../common/pipes/image-validation.pipe.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ConfigService } from '../../config/config.service.js';
import { authenticatedThrottler } from '../../config/throttler.config.js';
import { LlmResponse } from '../../llm/types.js';

/**
 * @class AssessorController
 * @description Controller responsible for handling all assessment-related API requests.
 * @remarks
 * This controller is part of the v1 API. It is protected by the `ApiKeyGuard`, ensuring that only
 * authorised clients can access its endpoints. It provides a single endpoint for creating new assessments.
 *
 * **Rate-Limiting (Throttling):**
 * This controller demonstrates how to override the global rate-limiting settings for a specific set of routes.
 * - `@Throttle(authenticatedThrottler)`: This decorator is applied at the controller level, meaning all endpoints
 *   within this controller will use the specific rate-limiting rules defined in the `authenticatedThrottler` configuration.
 *   This is a crucial security and performance feature, allowing us to apply stricter limits to authenticated,
 *   resource-intensive operations compared to the global default for unauthenticated routes.
 *
 * **Input Validation:**
 * - The `create` method uses the `ZodValidationPipe` to validate the incoming request body against the `assessorDtoSchema`.
 * - For tasks of type `IMAGE`, it also programmatically uses the `ImageValidationPipe` to perform more complex,
 *   asynchronous validation on the image data itself.
 * @see AppModule - Where the global `ThrottlerGuard` is configured.
 * @see config/throttler.config.ts - Where the `authenticatedThrottler` configuration is defined.
 * @see auth/api-key.guard.ts - The guard that protects this controller.
 */
@Controller('v1/assessor')
@UseGuards(ApiKeyGuard)
@Throttle(authenticatedThrottler)
export class AssessorController {
  constructor(
    private readonly assessorService: AssessorService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Creates a new assessment by processing the provided task data.
   *
   * This endpoint serves as the primary entry point for assessment requests.
   * It performs comprehensive validation including schema validation via Zod
   * and specialized image validation for IMAGE task types. The method then
   * delegates to the AssessorService to orchestrate the assessment process.
   *
   * **Image Task Validation:**
   * For IMAGE task types, this method performs additional validation on the
   * image data using the ImageValidationPipe to ensure proper format, size,
   * and MIME type compliance.
   * @param {CreateAssessorDto} assessorDto - Validated data transfer object
   *   containing task details.
   * @returns {Promise<LlmResponse>} Promise resolving to LLM assessment
   *   response with scoring and reasoning.
   * @throws {BadRequestException} If validation fails for any field.
   * @throws {UnauthorizedException} If API key authentication fails.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(assessorDtoSchema))
    assessorDto: CreateAssessorDto,
  ): Promise<LlmResponse> {
    // If taskType is IMAGE, validate image fields using ImageValidationPipe
    if (assessorDto.taskType === 'IMAGE') {
      const imagePipe = new ImageValidationPipe(this.configService);
      // Validate each image field
      await imagePipe.transform(assessorDto.reference);
      await imagePipe.transform(assessorDto.studentResponse);
      await imagePipe.transform(assessorDto.template);
    }
    return this.assessorService.createAssessment(assessorDto);
  }
}
