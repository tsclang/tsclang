#include "runtime.h"

typedef struct { TscError _base; } AppError;

static AppError AppError_new(String msg) {
    AppError self = {0};
    self._base.message = msg;
    return self;
}

int main(void) {
    TSC_INIT();
    return 0;
}
