#include "runtime.h"

typedef int32_t UserId;

int32_t validate_UserId(UserId id) {
    return id;
}

int main(void) {
    TSC_INIT();
    return 0;
}
