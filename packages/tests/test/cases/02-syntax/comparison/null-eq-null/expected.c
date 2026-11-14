#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (NULL == NULL) ? "true" : "false");
    printf("%s\n", (NULL != NULL) ? "true" : "false");
    return 0;
}
