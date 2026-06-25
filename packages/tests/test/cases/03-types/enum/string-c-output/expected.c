#include "runtime.h"

typedef enum { Status_Ok = 0, Status_Fail = 1 } Status;
static const char *Status_strings[] = { "OK", "FAIL" };

int main(void) {
    TSC_INIT();
    return 0;
}
