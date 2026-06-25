#include "runtime.h"

static const int32_t SQLITE_OK = 0;

int main(void) {
    TSC_INIT();
    printf("%d\n", SQLITE_OK);
    return 0;
}
