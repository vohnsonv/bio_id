#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <IBScanUltimateApi.h>

int m_handle = -1;
volatile bool m_done = false;
volatile int m_init_progress = 0;
int m_width = 0, m_height = 0;
unsigned char* m_image_buffer = NULL;

void OnInitProgress(int deviceIndex, void* pContext, int progress) {
    m_init_progress = progress;
    printf("INIT_PROGRESS_%d\n", progress);
    fflush(stdout);
}

void OnResult(const int handle, void* pContext, const IBSU_ImageData image, const IBSU_ImageType type, const IBSU_ImageData *pSplitImageArray, const int splitImageArrayCount) {
    m_width = image.Width; 
    m_height = image.Height;
    int size = m_width * m_height;
    
    if (size > 0 && image.Buffer != NULL) {
        if (m_image_buffer) free(m_image_buffer);
        m_image_buffer = (unsigned char*)malloc(size);
        memcpy(m_image_buffer, image.Buffer, size);
    }
    m_done = true;
}

int main() {
    int count = 0;
    IBSU_GetDeviceCount(&count);
    if (count == 0) { printf("ERROR_NODEVICE\n"); fflush(stdout); return 1; }
    
    IBSU_RegisterCallbacks(0, ENUM_IBSU_ESSENTIAL_EVENT_INIT_PROGRESS, (void*)OnInitProgress, NULL);
    
    if (IBSU_OpenDevice(0, &m_handle) != 0) {
        printf("ERROR_OPEN\n"); fflush(stdout); return 1;
    }
    
    IBSU_RegisterCallbacks(m_handle, ENUM_IBSU_ESSENTIAL_EVENT_RESULT_IMAGE, (void*)OnResult, NULL);
    
    while(m_init_progress < 100) { usleep(100000); }
    printf("READY\n"); fflush(stdout);
    
    char cmd[256];
    while(fgets(cmd, sizeof(cmd), stdin)) {
        if (strncmp(cmd, "CAPTURE", 7) == 0) {
            m_done = false;
            int res = IBSU_BeginCaptureImage(m_handle, ENUM_IBSU_FLAT_SINGLE_FINGER, ENUM_IBSU_IMAGE_RESOLUTION_500, 3);
            if (res != 0) { printf("ERROR_BEGIN_%d\n", res); fflush(stdout); continue; }
            
            for (int i = 0; i < 400 && !m_done; i++) usleep(100000);
            
            if (m_done && m_image_buffer) {
                FILE* f = fopen("capture.raw", "wb");
                fwrite(&m_width, sizeof(int), 1, f);
                fwrite(&m_height, sizeof(int), 1, f);
                fwrite(m_image_buffer, 1, m_width * m_height, f);
                fclose(f);
                printf("SUCCESS\n");
            } else {
                IBSU_CancelCaptureImage(m_handle);
                printf("ERROR_TIMEOUT\n");
            }
            fflush(stdout);
        }
        else if (strncmp(cmd, "EXIT", 4) == 0) break;
    }
    IBSU_CloseDevice(m_handle);
    return 0;
}
