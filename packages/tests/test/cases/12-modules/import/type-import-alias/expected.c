#include "runtime.h"

typedef int32_t types_UserId;

int32_t validate_UserId(types_UserId id) {
    return id;
}

int main(void) {
    TSC_INIT();
    return 0;
}
