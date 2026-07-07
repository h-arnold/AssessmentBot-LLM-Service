import { AssessorController } from './assessor.controller.js';
import { TaskType, type CreateAssessorDto } from './dto/create-assessor.dto.js';
import { ImageValidationPipe } from '../../common/pipes/image-validation.pipe.js';
import { ConfigService } from '../../config/config.service.js';

describe('AssessorController', () => {
  const mockAssessorService = {
    createAssessment: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates image payloads when task type is IMAGE', async () => {
    const controller = new AssessorController(
      mockAssessorService as never,
      mockConfigService,
    );
    const transformSpy = vi
      .spyOn(ImageValidationPipe.prototype, 'transform')
      .mockResolvedValue('ok');

    const payload: CreateAssessorDto = {
      taskType: TaskType.IMAGE,
      reference: 'data:image/png;base64,abcd',
      template: 'data:image/png;base64,efgh',
      studentResponse: 'data:image/png;base64,ijkl',
    };

    mockAssessorService.createAssessment.mockResolvedValueOnce({
      score: 4,
    });

    await controller.create(payload);

    expect(transformSpy).toHaveBeenCalledTimes(3);
    expect(transformSpy).toHaveBeenNthCalledWith(1, payload.reference);
    expect(transformSpy).toHaveBeenNthCalledWith(2, payload.studentResponse);
    expect(transformSpy).toHaveBeenNthCalledWith(3, payload.template);
    expect(mockAssessorService.createAssessment).toHaveBeenCalledWith(payload);
  });

  it('skips image validation for non-image task types', async () => {
    const controller = new AssessorController(
      mockAssessorService as never,
      mockConfigService,
    );
    const transformSpy = vi.spyOn(ImageValidationPipe.prototype, 'transform');

    const payload: CreateAssessorDto = {
      taskType: TaskType.TEXT,
      reference: 'Reference',
      template: '',
      studentResponse: '',
    };

    mockAssessorService.createAssessment.mockResolvedValueOnce({
      score: 5,
    });

    await controller.create(payload);

    expect(transformSpy).not.toHaveBeenCalled();
    expect(mockAssessorService.createAssessment).toHaveBeenCalledWith(payload);
  });
});
