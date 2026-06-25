#include "runtime.h"

typedef struct { TscError _base; } MyError;

static MyError MyError_new(String msg) {
    MyError self = {0};
    self._base.message = msg;
    return self;
}

int main(void) {
    TSC_INIT();
    MyError _err_0 = MyError_new(STR_LIT("oops"));
    printf("%s\n", _err_0._base.message.data);
    return 0;
}
