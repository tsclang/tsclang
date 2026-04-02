#include "runtime.h"

typedef enum { Status_Ok = 0 } Status;
static const char *Status_strings[] = { "OK" };

int main(void) {
    TSC_INIT();
    printf("%s\n", Status_strings[(int)Status_Ok]);
    return 0;
}
