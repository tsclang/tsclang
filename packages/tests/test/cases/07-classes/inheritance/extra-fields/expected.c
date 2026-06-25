#include "runtime.h"

typedef struct { TscError _base; int32_t code; } MyError;

static MyError MyError_new(String msg) {
    MyError self = {0};
    self._base.message = msg;
    self.code = 42;
    return self;
}

int main(void) {
    TSC_INIT();
    MyError _err_0 = MyError_new(STR_LIT("oops"));
    printf("%s\n", _err_0._base.message.data);
    printf("%d\n", _err_0.code);
    return 0;
}
